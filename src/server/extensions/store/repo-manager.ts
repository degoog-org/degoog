import { readFile, writeFile, mkdir, readdir, stat, rm } from "fs/promises";
import { join, resolve, dirname, relative } from "path";
import { createHash } from "crypto";
import { removeSettings } from "../../utils/plugin-settings";
import { reloadCommands } from "../commands/registry";
import { reloadSlotPlugins } from "../slots/registry";
import { reloadSearchResultTabs } from "../search-result-tabs/registry";
import { reloadSearchBarActions } from "../search-bar/registry";
import { reloadPluginRoutes } from "../plugin-routes/registry";
import { reloadMiddlewareRegistry } from "../middleware/registry";
import { reloadThemes } from "../themes/registry";
import { reloadEngines } from "../engines/registry";
import { reloadTransports } from "../transports/registry";
import { ExtensionStoreType } from "../../types";
import type {
  RepoInfo,
  ReposData,
  StoreItem,
  InstalledItem,
  RepoPackageJson,
  AuthorJson,
} from "./types";
import {
  pluginsDir,
  themesDir,
  enginesDir,
  transportsDir,
} from "../../utils/paths";

const CLONE_TIMEOUT_MS = 60_000;
const OFFICIAL_REPO_URL =
  "https://github.com/fccview/fccview-degoog-extensions.git";

function getDataDir(): string {
  return process.env.DEGOOG_DATA_DIR ?? join(process.cwd(), "data");
}

function getReposPath(): string {
  return join(getDataDir(), "repos.json");
}

function getStoreDir(): string {
  return join(getDataDir(), "store");
}

function normalizeRepoUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.endsWith(".git")) return trimmed;
  return (
    trimmed + (trimmed.includes("?") || trimmed.includes("#") ? "" : ".git")
  );
}

function slugFromUrl(url: string): string {
  const normalized = normalizeRepoUrl(url);
  const hash = createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, 8);
  let repoName = "repo";
  try {
    const u = new URL(normalized.replace(/\.git$/, ""));
    const segments = u.pathname.split("/").filter(Boolean);
    repoName = (segments.pop() ?? "repo").replace(/\.git$/, "") || "repo";
  } catch {
    repoName = "repo";
  }
  const safeName = repoName.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 32);
  return `${hash}-${safeName}`;
}

function isValidGitUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const u = new URL(trimmed.replace(/\.git$/, ""));
    return (
      u.protocol === "http:" || u.protocol === "https:" || u.protocol === "ssh:"
    );
  } catch {
    return false;
  }
}

async function ensureReposStructure(): Promise<void> {
  const storeDir = getStoreDir();
  await mkdir(storeDir, { recursive: true });
  const reposPath = getReposPath();
  try {
    await readFile(reposPath, "utf-8");
  } catch {
    const initial: ReposData = { repos: [], installed: [] };
    await mkdir(dirname(reposPath), { recursive: true });
    await writeFile(reposPath, JSON.stringify(initial, null, 2), "utf-8");
  }
}

async function readReposData(): Promise<ReposData> {
  await ensureReposStructure();
  const raw = await readFile(getReposPath(), "utf-8");
  let parsed: ReposData;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      parsed = { repos: [], installed: [] };
    } else {
      parsed = obj as ReposData;
      if (!Array.isArray(parsed.repos)) parsed.repos = [];
      if (!Array.isArray(parsed.installed)) parsed.installed = [];
    }
  } catch {
    parsed = { repos: [], installed: [] };
  }
  return parsed;
}

async function writeReposData(data: ReposData): Promise<void> {
  await ensureReposStructure();
  await writeFile(getReposPath(), JSON.stringify(data, null, 2), "utf-8");
}

function getRepoByUrl(data: ReposData, url: string): RepoInfo | undefined {
  const normalized = normalizeRepoUrl(url);
  return data.repos.find((r) => normalizeRepoUrl(r.url) === normalized);
}

export async function addRepo(url: string): Promise<RepoInfo> {
  if (!isValidGitUrl(url)) {
    throw new Error(
      "Invalid git URL. Use http(s) or ssh URL ending in .git or without.",
    );
  }
  const normalized = normalizeRepoUrl(url);
  const data = await readReposData();
  if (data.repos.some((r) => normalizeRepoUrl(r.url) === normalized)) {
    throw new Error("This repository is already added.");
  }
  const slug = slugFromUrl(url);
  const storeDir = getStoreDir();
  const dest = join(storeDir, slug);
  const proc = Bun.spawn(["git", "clone", "--depth", "1", normalized, dest], {
    cwd: storeDir,
    stdout: "ignore",
    stderr: "pipe",
  });
  const exit = await Promise.race([
    proc.exited,
    new Promise<number>((_, rej) =>
      setTimeout(() => {
        proc.kill();
        rej(new Error("Clone timed out"));
      }, CLONE_TIMEOUT_MS),
    ),
  ]);
  if (exit !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(err || `Git clone failed with code ${exit}`);
  }
  const pkgPath = join(dest, "package.json");
  let pkg: RepoPackageJson;
  try {
    const raw = await readFile(pkgPath, "utf-8");
    pkg = JSON.parse(raw) as RepoPackageJson;
  } catch {
    await rm(dest, { recursive: true, force: true });
    throw new Error("Repository has no valid package.json in the root.");
  }
  const now = new Date().toISOString();
  const repoInfo: RepoInfo = {
    url: normalized,
    localPath: slug,
    addedAt: now,
    lastFetched: now,
    name: pkg.name ?? slug,
    description: pkg.description ?? "",
    error: null,
    repoImage: pkg["repo-image"] ?? null,
  };
  data.repos.push(repoInfo);
  await writeReposData(data);
  return repoInfo;
}

export async function removeRepo(url: string): Promise<void> {
  const data = await readReposData();
  const repo = getRepoByUrl(data, url);
  if (!repo) throw new Error("Repository not found.");
  if (normalizeRepoUrl(repo.url) === normalizeRepoUrl(OFFICIAL_REPO_URL)) {
    throw new Error("The official extensions repository cannot be removed.");
  }
  const installedFromRepo = data.installed.filter(
    (i) => normalizeRepoUrl(i.repoUrl) === normalizeRepoUrl(url),
  );
  if (installedFromRepo.length > 0) {
    const list = installedFromRepo
      .map((i) => `${i.type} ${i.installedAs}`)
      .join(", ");
    throw new Error(`Uninstall these items first: ${list}`);
  }
  const dest = join(getStoreDir(), repo.localPath);
  await rm(dest, { recursive: true, force: true }).catch(() => {});
  data.repos = data.repos.filter(
    (r) => normalizeRepoUrl(r.url) !== normalizeRepoUrl(url),
  );
  await writeReposData(data);
}

export async function refreshRepo(url?: string): Promise<void> {
  const data = await readReposData();
  const repos = url ? [getRepoByUrl(data, url)] : data.repos;
  const toRefresh = repos.filter((r): r is RepoInfo => r != null);
  for (const repo of toRefresh) {
    const repoPath = join(getStoreDir(), repo.localPath);
    try {
      const proc = Bun.spawn(["git", "-C", repoPath, "pull"], {
        stdout: "ignore",
        stderr: "pipe",
      });
      const exit = await proc.exited;
      if (exit !== 0) {
        const err = await new Response(proc.stderr).text();
        repo.error = err || `Git pull failed (${exit})`;
        continue;
      }
      repo.error = null;
      repo.lastFetched = new Date().toISOString();
      const pkgPath = join(repoPath, "package.json");
      const raw = await readFile(pkgPath, "utf-8");
      const pkg = JSON.parse(raw) as RepoPackageJson;
      repo.name = pkg.name ?? repo.name;
      repo.description = pkg.description ?? repo.description;
      repo.repoImage = pkg["repo-image"] ?? null;
    } catch (e) {
      repo.error = e instanceof Error ? e.message : String(e);
    }
  }
  await writeReposData(data);
}

export async function refreshAllRepos(): Promise<
  { url: string; error: string | null }[]
> {
  const data = await readReposData();
  const results: { url: string; error: string | null }[] = [];
  for (const repo of data.repos) {
    try {
      await refreshRepo(repo.url);
      const updated = await readReposData();
      const r = getRepoByUrl(updated, repo.url);
      results.push({ url: repo.url, error: r?.error ?? null });
    } catch {
      results.push({ url: repo.url, error: "Refresh failed" });
    }
  }
  return results;
}

async function readAuthorJson(dir: string): Promise<AuthorJson | null> {
  try {
    const raw = await readFile(join(dir, "author.json"), "utf-8");
    const parsed = JSON.parse(raw) as AuthorJson;
    return parsed?.name ? parsed : null;
  } catch {
    return null;
  }
}

async function listScreenshots(dir: string): Promise<string[]> {
  const screenshotsDir = join(dir, "screenshots");
  try {
    const files = await readdir(screenshotsDir);
    return files.filter((f) => /\.(png|jpg|jpeg|gif|webp)$/i.test(f)).sort();
  } catch {
    return [];
  }
}

async function inferEngineTypeFromFolder(dir: string): Promise<string | null> {
  for (const entryFile of ["index.ts", "index.js", "index.mjs", "index.cjs"]) {
    try {
      const raw = await readFile(join(dir, entryFile), "utf-8");
      const match = raw.match(/export\s+const\s+type\s*=\s*["']([^"']+)["']/);
      if (match?.[1]) return match[1].trim();
    } catch {
      //
    }
  }
  return null;
}

export async function listRepoItems(repoUrl?: string): Promise<StoreItem[]> {
  const data = await readReposData();
  const repos = repoUrl ? [getRepoByUrl(data, repoUrl)] : data.repos;
  const installedSet = new Set(
    data.installed.map(
      (i) => `${normalizeRepoUrl(i.repoUrl)}::${i.type}::${i.itemPath}`,
    ),
  );
  const installedMap = new Map(
    data.installed.map((i) => [
      `${normalizeRepoUrl(i.repoUrl)}::${i.type}::${i.itemPath}`,
      i,
    ]),
  );
  const items: StoreItem[] = [];
  const storeDir = getStoreDir();

  for (const repo of repos) {
    if (!repo) continue;
    const repoPath = join(storeDir, repo.localPath);
    let pkg: RepoPackageJson;
    try {
      const raw = await readFile(join(repoPath, "package.json"), "utf-8");
      pkg = JSON.parse(raw) as RepoPackageJson;
    } catch {
      continue;
    }
    const topAuthor =
      typeof pkg.author === "string"
        ? { name: pkg.author, url: undefined, avatar: undefined }
        : null;

    const push = async (
      type: ExtensionStoreType,
      entries: Array<{
        path: string;
        name: string;
        description?: string;
        version?: string;
        type?: string;
      }>,
    ) => {
      for (const ent of entries) {
        const itemPath = ent.path.replace(/\/$/, "");
        const fullPath = join(repoPath, itemPath);
        try {
          const st = await stat(fullPath);
          if (!st.isDirectory()) continue;
        } catch {
          continue;
        }
        const author = await readAuthorJson(fullPath);
        const screenshots = await listScreenshots(fullPath);
        const key = `${normalizeRepoUrl(repo.url)}::${type}::${itemPath}`;
        const inst = installedMap.get(key);
        const folderName = itemPath.split("/").pop() ?? itemPath;
        const isInstalled = installedSet.has(key);
        const repoVersion = ent.version ?? "0.0.0";
        const item: StoreItem = {
          repoUrl: repo.url,
          repoSlug: repo.localPath,
          repoName: repo.name,
          type,
          path: itemPath,
          name: ent.name || folderName,
          description: ent.description ?? "",
          version: repoVersion,
          author: author
            ? { name: author.name, url: author.url, avatar: author.avatar }
            : topAuthor,
          screenshots,
          installed: isInstalled,
          installedVersion: inst?.version,
          updateAvailable:
            isInstalled && !!inst?.version && inst.version !== repoVersion,
        };
        if (type === ExtensionStoreType.Plugin && ent.type)
          item.pluginType = ent.type;
        if (type === ExtensionStoreType.Engine) {
          if (ent.type) item.engineType = ent.type;
          else {
            const inferred = await inferEngineTypeFromFolder(fullPath);
            if (inferred) item.engineType = inferred;
            else item.engineType = "web";
          }
        }
        items.push(item);
      }
    };

    if (pkg.plugins) await push(ExtensionStoreType.Plugin, pkg.plugins);
    if (pkg.themes) await push(ExtensionStoreType.Theme, pkg.themes);
    if (pkg.engines) await push(ExtensionStoreType.Engine, pkg.engines);
    if (pkg.transports)
      await push(ExtensionStoreType.Transport, pkg.transports);
  }

  return items;
}

function getDestDir(type: ExtensionStoreType): string {
  if (type === ExtensionStoreType.Plugin) return pluginsDir();
  if (type === ExtensionStoreType.Theme) return themesDir();
  if (type === ExtensionStoreType.Transport) return transportsDir();
  return enginesDir();
}

const STORE_METADATA = ["author.json", "screenshots"];

async function copyItemDir(
  srcDir: string,
  destDir: string,
  exclude: string[],
): Promise<void> {
  await mkdir(destDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const e of entries) {
    if (exclude.some((x) => e.name === x || e.name.startsWith(x + "/")))
      continue;
    const src = join(srcDir, e.name);
    const dest = join(destDir, e.name);
    if (e.isDirectory()) {
      await copyItemDir(src, dest, []);
    } else {
      await mkdir(dirname(dest), { recursive: true });
      await Bun.write(dest, await Bun.file(src).arrayBuffer());
    }
  }
}

function _parseDependencyUrl(depUrl: string): {
  repoUrl: string;
  type: ExtensionStoreType;
  itemPath: string;
} | null {
  const cleaned = depUrl.replace(/\.git(\/|$)/, "/").replace(/\/$/, "");
  const typePatterns: Array<{
    type: ExtensionStoreType;
    pattern: RegExp;
  }> = [
    { type: ExtensionStoreType.Plugin, pattern: /^(.+?)\/(plugins\/[^/]+)$/ },
    { type: ExtensionStoreType.Theme, pattern: /^(.+?)\/(themes\/[^/]+)$/ },
    { type: ExtensionStoreType.Engine, pattern: /^(.+?)\/(engines\/[^/]+)$/ },
    {
      type: ExtensionStoreType.Transport,
      pattern: /^(.+?)\/(transports\/[^/]+)$/,
    },
  ];
  for (const { type, pattern } of typePatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      return { repoUrl: match[1], type, itemPath: match[2] };
    }
  }
  return null;
}

const _installingSet = new Set<string>();

async function _installDependencies(dependencies: string[]): Promise<void> {
  for (const depUrl of dependencies) {
    const parsed = _parseDependencyUrl(depUrl);
    if (!parsed) continue;

    const normalizedPath = parsed.itemPath.replace(/\/$/, "");
    const depKey = `${normalizeRepoUrl(parsed.repoUrl)}::${parsed.type}::${normalizedPath}`;
    if (_installingSet.has(depKey)) continue;

    const data = await readReposData();
    const isInstalled = data.installed.some(
      (i) =>
        normalizeRepoUrl(i.repoUrl) === normalizeRepoUrl(parsed.repoUrl) &&
        i.type === parsed.type &&
        i.itemPath === normalizedPath,
    );
    if (isInstalled) continue;

    let repo = getRepoByUrl(data, parsed.repoUrl);
    if (!repo) {
      try {
        repo = await addRepo(parsed.repoUrl);
      } catch {
        continue;
      }
    }

    try {
      await installItem(parsed.repoUrl, parsed.itemPath, parsed.type);
    } catch {
      //
    }
  }
}

export async function installItem(
  repoUrl: string,
  itemPath: string,
  type: ExtensionStoreType,
): Promise<void> {
  const data = await readReposData();
  const repo = getRepoByUrl(data, repoUrl);
  if (!repo) throw new Error("Repository not found.");
  const normalizedPath = itemPath.replace(/\/$/, "");
  const key = `${normalizeRepoUrl(repoUrl)}::${type}::${normalizedPath}`;
  if (_installingSet.has(key)) return;
  if (
    data.installed.some(
      (i) => `${normalizeRepoUrl(i.repoUrl)}::${i.type}::${i.itemPath}` === key,
    )
  ) {
    return;
  }
  _installingSet.add(key);
  const storeDir = getStoreDir();
  const srcDir = join(storeDir, repo.localPath, normalizedPath);
  const repoBase = resolve(join(storeDir, repo.localPath));
  if (!resolve(srcDir).startsWith(repoBase + "/")) {
    throw new Error("Invalid item path.");
  }
  try {
    await stat(srcDir);
  } catch {
    throw new Error("Item path not found in repository.");
  }
  const pkgPath = join(storeDir, repo.localPath, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as RepoPackageJson;
  let entries:
    | Array<{
        path: string;
        name: string;
        description?: string;
        version?: string;
        type?: string;
        dependencies?: string[];
      }>
    | undefined;

  if (type === ExtensionStoreType.Plugin) {
    entries = pkg.plugins;
  } else if (type === ExtensionStoreType.Theme) {
    entries = pkg.themes;
  } else if (type === ExtensionStoreType.Transport) {
    entries = pkg.transports;
  } else {
    entries = pkg.engines;
  }

  const manifest = entries?.find(
    (e) => e.path.replace(/\/$/, "") === normalizedPath,
  );
  if (!manifest) throw new Error("Item not listed in package.json.");

  if (manifest.dependencies?.length) {
    await _installDependencies(manifest.dependencies);
  }

  const freshData = await readReposData();

  const folderName = normalizedPath.split("/").pop() ?? normalizedPath;
  const destBase = getDestDir(type);
  await mkdir(destBase, { recursive: true });
  const destDir = join(destBase, folderName);
  try {
    await stat(destDir);
    throw new Error(
      `A ${type} named "${folderName}" already exists. Remove it first.`,
    );
  } catch (e) {
    if (e instanceof Error && e.message.includes("already exists")) throw e;
  }
  await copyItemDir(srcDir, destDir, STORE_METADATA);
  const version = manifest.version ?? "0.0.0";
  freshData.installed.push({
    repoUrl: repo.url,
    type,
    itemPath: normalizedPath,
    installedAs: folderName,
    installedAt: new Date().toISOString(),
    version,
  });
  await writeReposData(freshData);
  _installingSet.delete(key);
  await reloadAfterAction(type);
}

export async function uninstallItem(
  repoUrl: string,
  itemPath: string,
  type: ExtensionStoreType,
): Promise<void> {
  const data = await readReposData();
  const normalizedPath = itemPath.replace(/\/$/, "");
  const inst = data.installed.find(
    (i) =>
      normalizeRepoUrl(i.repoUrl) === normalizeRepoUrl(repoUrl) &&
      i.type === type &&
      i.itemPath === normalizedPath,
  );
  if (!inst) throw new Error("Item is not installed.");
  const destBase = getDestDir(type);
  const destDir = join(destBase, inst.installedAs);
  await rm(destDir, { recursive: true, force: true }).catch(() => {});

  const settingsIds: string[] = [];
  if (type === ExtensionStoreType.Plugin) {
    settingsIds.push(`plugin-${inst.installedAs}`, `slot-${inst.installedAs}`);
  } else if (type === ExtensionStoreType.Theme) {
    settingsIds.push(`theme-${inst.installedAs}`);
  } else if (type === ExtensionStoreType.Transport) {
    settingsIds.push(`transport-${inst.installedAs}`);
  } else {
    settingsIds.push(`engine-${inst.installedAs}`);
  }
  for (const id of settingsIds) {
    await removeSettings(id);
  }

  data.installed = data.installed.filter((i) => i !== inst);
  await writeReposData(data);
  await reloadAfterAction(type);
}

async function reloadAfterAction(type: ExtensionStoreType): Promise<void> {
  if (type === ExtensionStoreType.Plugin) {
    await reloadSlotPlugins();
    await reloadSearchResultTabs();
    await reloadCommands();
    await reloadSearchBarActions();
    await reloadPluginRoutes();
    await reloadMiddlewareRegistry();
  } else if (type === ExtensionStoreType.Theme) {
    await reloadThemes();
  } else if (type === ExtensionStoreType.Transport) {
    await reloadTransports();
  } else {
    await reloadEngines();
  }
}

export async function updateItem(
  repoUrl: string,
  itemPath: string,
  type: ExtensionStoreType,
): Promise<void> {
  const data = await readReposData();
  const repo = getRepoByUrl(data, repoUrl);
  if (!repo) throw new Error("Repository not found.");
  const normalizedPath = itemPath.replace(/\/$/, "");
  const inst = data.installed.find(
    (i) =>
      normalizeRepoUrl(i.repoUrl) === normalizeRepoUrl(repoUrl) &&
      i.type === type &&
      i.itemPath === normalizedPath,
  );
  if (!inst) throw new Error("Item is not installed.");

  const storeDir = getStoreDir();
  const srcDir = join(storeDir, repo.localPath, normalizedPath);
  try {
    await stat(srcDir);
  } catch {
    throw new Error("Item path not found in repository.");
  }

  const pkgPath = join(storeDir, repo.localPath, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as RepoPackageJson;
  let entries:
    | Array<{
        path: string;
        name: string;
        description?: string;
        version?: string;
        type?: string;
        dependencies?: string[];
      }>
    | undefined;

  if (type === ExtensionStoreType.Plugin) {
    entries = pkg.plugins;
  } else if (type === ExtensionStoreType.Theme) {
    entries = pkg.themes;
  } else if (type === ExtensionStoreType.Transport) {
    entries = pkg.transports;
  } else {
    entries = pkg.engines;
  }

  const manifest = entries?.find(
    (e) => e.path.replace(/\/$/, "") === normalizedPath,
  );

  const destBase = getDestDir(type);
  const destDir = join(destBase, inst.installedAs);
  await rm(destDir, { recursive: true, force: true }).catch(() => {});
  await copyItemDir(srcDir, destDir, STORE_METADATA);
  if (manifest?.version) inst.version = manifest.version;
  await writeReposData(data);
  await reloadAfterAction(type);
}

export async function updateAllItems(): Promise<{ updated: number }> {
  const items = await listRepoItems();
  const updatable = items.filter((i) => i.updateAvailable);
  for (const item of updatable) {
    await updateItem(item.repoUrl, item.path, item.type);
  }
  return { updated: updatable.length };
}

export async function getInstalledItems(): Promise<InstalledItem[]> {
  const data = await readReposData();
  return data.installed;
}

async function ensureOfficialRepo(): Promise<void> {
  const data = await readReposData();
  if (data.repos.length > 0) return;
  const normalized = normalizeRepoUrl(OFFICIAL_REPO_URL);
  if (data.repos.some((r) => normalizeRepoUrl(r.url) === normalized)) return;
  try {
    await addRepo(OFFICIAL_REPO_URL);
  } catch {
    //
  }
}

const FETCH_TIMEOUT_MS = 15_000;

async function getBehindCount(repoPath: string): Promise<number> {
  let remoteRef = "origin/HEAD";
  for (const ref of ["origin/HEAD", "origin/main", "origin/master"]) {
    const proc = Bun.spawn(["git", "-C", repoPath, "rev-parse", ref], {
      stdout: "ignore",
      stderr: "ignore",
    });
    const exit = await proc.exited;
    if (exit === 0) {
      remoteRef = ref;
      break;
    }
  }
  const countProc = Bun.spawn(
    ["git", "-C", repoPath, "rev-list", "--count", `HEAD..${remoteRef}`],
    { stdout: "pipe", stderr: "ignore" },
  );
  const exit = await countProc.exited;
  if (exit !== 0) return 0;
  const out = await new Response(countProc.stdout).text();
  const n = parseInt(out.trim(), 10);
  return Number.isNaN(n) ? 0 : Math.max(0, n);
}

export interface RepoStatus {
  url: string;
  behind: number;
}

export async function getReposStatus(): Promise<RepoStatus[]> {
  const data = await readReposData();
  const storeDir = getStoreDir();
  const results: RepoStatus[] = [];

  for (const repo of data.repos) {
    const repoPath = join(storeDir, repo.localPath);
    try {
      const fetchProc = Bun.spawn(["git", "-C", repoPath, "fetch", "origin"], {
        stdout: "ignore",
        stderr: "pipe",
      });
      await Promise.race([
        fetchProc.exited,
        new Promise<number>((_, rej) =>
          setTimeout(() => {
            fetchProc.kill();
            rej(new Error("Fetch timed out"));
          }, FETCH_TIMEOUT_MS),
        ),
      ]);
    } catch {
      results.push({ url: repo.url, behind: 0 });
      continue;
    }

    try {
      const behind = await getBehindCount(repoPath);
      results.push({ url: repo.url, behind });
    } catch {
      results.push({ url: repo.url, behind: 0 });
    }
  }

  return results;
}

export async function getRepos(): Promise<RepoInfo[]> {
  const data = await readReposData();
  if (data.repos.length === 0) {
    await ensureOfficialRepo();
    const after = await readReposData();
    return after.repos;
  }
  return data.repos;
}

export function getStoreDirPath(): string {
  return getStoreDir();
}

export function getRepoSlugFromUrl(url: string): string {
  return slugFromUrl(url);
}

export function resolveScreenshotPath(
  repoSlug: string,
  itemPath: string,
  filename: string,
): string | null {
  const storeDir = getStoreDir();
  const repoBase = resolve(storeDir, repoSlug);
  const normalized = filename.replace(/[^a-zA-Z0-9._-]/g, "");
  if (normalized !== filename) return null;
  const full = resolve(repoBase, itemPath, "screenshots", filename);
  const rel = relative(repoBase, full);
  if (rel.startsWith("..") || rel.includes("..")) return null;
  return full;
}

const REPO_ASSET_EXT = /\.(png|jpeg|jpg|gif|webp|svg)$/i;

export function resolveRepoAssetPath(
  repoSlug: string,
  relativePath: string,
): string | null {
  const storeDir = getStoreDir();
  const repoBase = resolve(storeDir, repoSlug);
  const trimmed = relativePath.replace(/^\/+/, "").trim();
  if (!trimmed || trimmed.includes("..")) return null;
  if (!REPO_ASSET_EXT.test(trimmed)) return null;
  const full = resolve(repoBase, trimmed);
  const rel = relative(repoBase, full);
  if (rel.startsWith("..") || rel.includes("..")) return null;
  return full;
}
