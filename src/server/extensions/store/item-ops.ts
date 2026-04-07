import { readFile, writeFile, mkdir, readdir, stat, rm } from "fs/promises";
import { join, resolve, dirname, relative } from "path";
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
import type { StoreItem, InstalledItem, RepoPackageJson, AuthorJson } from "../../types";
import {
  pluginsDir,
  themesDir,
  enginesDir,
  transportsDir,
} from "../../utils/paths";
import {
  normalizeRepoUrl,
  getStoreDir,
  readReposData,
  writeReposData,
  getRepoByUrl,
} from "./persistence";
import { addRepo } from "./repo-ops";

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

async function copyItemDir(srcDir: string, destDir: string, exclude: string[]): Promise<void> {
  await mkdir(destDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const e of entries) {
    if (exclude.some((x) => e.name === x || e.name.startsWith(x + "/"))) continue;
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

function getDestDir(type: ExtensionStoreType): string {
  if (type === ExtensionStoreType.Plugin) return pluginsDir();
  if (type === ExtensionStoreType.Theme) return themesDir();
  if (type === ExtensionStoreType.Transport) return transportsDir();
  return enginesDir();
}

function getEntriesForType(
  pkg: RepoPackageJson,
  type: ExtensionStoreType,
): Array<{ path: string; name: string; description?: string; version?: string; type?: string; dependencies?: string[] }> | undefined {
  if (type === ExtensionStoreType.Plugin) return pkg.plugins;
  if (type === ExtensionStoreType.Theme) return pkg.themes;
  if (type === ExtensionStoreType.Transport) return pkg.transports;
  return pkg.engines;
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

const STORE_METADATA = ["author.json", "screenshots"];

function parseDependencyUrl(depUrl: string): {
  repoUrl: string;
  type: ExtensionStoreType;
  itemPath: string;
} | null {
  const cleaned = depUrl.replace(/\.git(\/|$)/, "/").replace(/\/$/, "");
  const typePatterns: Array<{ type: ExtensionStoreType; pattern: RegExp }> = [
    { type: ExtensionStoreType.Plugin, pattern: /^(.+?)\/(plugins\/[^/]+)$/ },
    { type: ExtensionStoreType.Theme, pattern: /^(.+?)\/(themes\/[^/]+)$/ },
    { type: ExtensionStoreType.Engine, pattern: /^(.+?)\/(engines\/[^/]+)$/ },
    { type: ExtensionStoreType.Transport, pattern: /^(.+?)\/(transports\/[^/]+)$/ },
  ];
  for (const { type, pattern } of typePatterns) {
    const match = cleaned.match(pattern);
    if (match) return { repoUrl: match[1], type, itemPath: match[2] };
  }
  return null;
}

const _installingSet = new Set<string>();

async function installDependencies(dependencies: string[]): Promise<void> {
  for (const depUrl of dependencies) {
    const parsed = parseDependencyUrl(depUrl);
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
      try { repo = await addRepo(parsed.repoUrl); } catch { continue; }
    }
    try {
      await installItem(parsed.repoUrl, parsed.itemPath, parsed.type);
    } catch {
      //
    }
  }
}

export async function listRepoItems(repoUrl?: string): Promise<StoreItem[]> {
  const data = await readReposData();
  const repos = repoUrl ? [getRepoByUrl(data, repoUrl)] : data.repos;
  const installedSet = new Set(
    data.installed.map((i) => `${normalizeRepoUrl(i.repoUrl)}::${i.type}::${i.itemPath}`),
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
      entries: Array<{ path: string; name: string; description?: string; version?: string; type?: string }>,
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
          updateAvailable: isInstalled && !!inst?.version && inst.version !== repoVersion,
        };
        if (type === ExtensionStoreType.Plugin && ent.type) item.pluginType = ent.type;
        if (type === ExtensionStoreType.Engine) {
          if (ent.type) item.engineType = ent.type;
          else {
            const inferred = await inferEngineTypeFromFolder(fullPath);
            item.engineType = inferred ?? "web";
          }
        }
        items.push(item);
      }
    };

    if (pkg.plugins) await push(ExtensionStoreType.Plugin, pkg.plugins);
    if (pkg.themes) await push(ExtensionStoreType.Theme, pkg.themes);
    if (pkg.engines) await push(ExtensionStoreType.Engine, pkg.engines);
    if (pkg.transports) await push(ExtensionStoreType.Transport, pkg.transports);
  }

  return items;
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
  if (data.installed.some((i) => `${normalizeRepoUrl(i.repoUrl)}::${i.type}::${i.itemPath}` === key)) return;
  _installingSet.add(key);
  const storeDir = getStoreDir();
  const srcDir = join(storeDir, repo.localPath, normalizedPath);
  const repoBase = resolve(join(storeDir, repo.localPath));
  if (!resolve(srcDir).startsWith(repoBase + "/")) throw new Error("Invalid item path.");
  try {
    await stat(srcDir);
  } catch {
    throw new Error("Item path not found in repository.");
  }
  const pkg = JSON.parse(
    await readFile(join(storeDir, repo.localPath, "package.json"), "utf-8"),
  ) as RepoPackageJson;
  const entries = getEntriesForType(pkg, type);
  const manifest = entries?.find((e) => e.path.replace(/\/$/, "") === normalizedPath);
  if (!manifest) throw new Error("Item not listed in package.json.");
  if (manifest.dependencies?.length) await installDependencies(manifest.dependencies);
  const freshData = await readReposData();
  const folderName = normalizedPath.split("/").pop() ?? normalizedPath;
  const destBase = getDestDir(type);
  await mkdir(destBase, { recursive: true });
  const destDir = join(destBase, folderName);
  try {
    await stat(destDir);
    throw new Error(`A ${type} named "${folderName}" already exists. Remove it first.`);
  } catch (e) {
    if (e instanceof Error && e.message.includes("already exists")) throw e;
  }
  await copyItemDir(srcDir, destDir, STORE_METADATA);
  freshData.installed.push({
    repoUrl: repo.url,
    type,
    itemPath: normalizedPath,
    installedAs: folderName,
    installedAt: new Date().toISOString(),
    version: manifest.version ?? "0.0.0",
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
  const destDir = join(getDestDir(type), inst.installedAs);
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
  for (const id of settingsIds) await removeSettings(id);
  data.installed = data.installed.filter((i) => i !== inst);
  await writeReposData(data);
  await reloadAfterAction(type);
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
  const pkg = JSON.parse(
    await readFile(join(storeDir, repo.localPath, "package.json"), "utf-8"),
  ) as RepoPackageJson;
  const entries = getEntriesForType(pkg, type);
  const manifest = entries?.find((e) => e.path.replace(/\/$/, "") === normalizedPath);
  const destDir = join(getDestDir(type), inst.installedAs);
  await rm(destDir, { recursive: true, force: true }).catch(() => {});
  await copyItemDir(srcDir, destDir, STORE_METADATA);
  if (manifest?.version) inst.version = manifest.version;
  await writeReposData(data);
  await reloadAfterAction(type);
}

export async function updateAllItems(): Promise<{ updated: number }> {
  const items = await listRepoItems();
  const updatable = items.filter((i) => i.updateAvailable);
  for (const item of updatable) await updateItem(item.repoUrl, item.path, item.type);
  return { updated: updatable.length };
}

export async function getInstalledItems(): Promise<InstalledItem[]> {
  const data = await readReposData();
  return data.installed;
}
