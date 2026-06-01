import { readFile, mkdir, readdir, stat, rm } from "fs/promises";
import { join, resolve, dirname } from "path";
import { removeSettings } from "../../utils/plugin-settings";
import { isVersionAtLeast, getAppVersion } from "../../utils/version";
import {
  ExtensionStoreType,
  type StoreItem,
  type InstalledItem,
  type RepoPackageJson,
  type AuthorJson,
} from "../../types";
import {
  normalizeRepoUrl,
  getStoreDir,
  readReposData,
  writeReposData,
  getRepoByUrl,
} from "./persistence";
import { addRepo } from "./repo-ops";
import { STORE_TYPE_SPECS } from "./store-types";
import { bumpPluginRegistryReload } from "../registry-factory";
import { createMutex } from "../../utils/mutex";
import { makeExtID } from "../../utils/extension-id";
import { logger } from "../../utils/logger";

const _storeMutex = createMutex();

function slugifyIdPart(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "unknown"
  );
}

function repoAuthorAndName(repoUrl: string): { author: string; name: string } {
  try {
    const u = new URL(repoUrl.replace(/\.git$/, ""));
    const parts = u.pathname.split("/").filter(Boolean);
    const authorRaw = parts[0] ?? "unknown";
    const repoRaw = (parts[1] ?? "repo").replace(/\.git$/, "");
    return { author: slugifyIdPart(authorRaw), name: slugifyIdPart(repoRaw) };
  } catch (err) {
    logger.debug("store:item", `invalid repo URL "${repoUrl}"`, err);
    return { author: "unknown", name: "repo" };
  }
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

function getDestDir(type: ExtensionStoreType): string {
  return STORE_TYPE_SPECS[type].destDir();
}

function canonicalInstalledFolder(
  type: ExtensionStoreType,
  folderName: string,
): string {
  if (type === ExtensionStoreType.Theme) return makeExtID(folderName, "theme");
  if (type === ExtensionStoreType.Autocomplete)
    return makeExtID(folderName, "autocomplete");
  return folderName;
}

export function settingsIdsForInstalled(
  type: ExtensionStoreType,
  installedAs: string,
): string[] {
  return STORE_TYPE_SPECS[type].settingsIds(installedAs);
}

function getEntriesForType(
  pkg: RepoPackageJson,
  type: ExtensionStoreType,
):
  | Array<{
      path: string;
      name: string;
      description?: string;
      version?: string;
      type?: string;
      dependencies?: string[];
      minDegoogVersion?: string;
    }>
  | undefined {
  return pkg[STORE_TYPE_SPECS[type].manifestKey];
}

export async function reloadAfterAction(
  type: ExtensionStoreType,
  bust = true,
): Promise<void> {
  if (bust) bumpPluginRegistryReload();
  await STORE_TYPE_SPECS[type].reload(bust);
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
    {
      type: ExtensionStoreType.Transport,
      pattern: /^(.+?)\/(transports\/[^/]+)$/,
    },
    {
      type: ExtensionStoreType.Autocomplete,
      pattern: /^(.+?)\/(autocomplete\/[^/]+)$/,
    },
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
      try {
        repo = await addRepo(parsed.repoUrl);
      } catch (err) {
        logger.warn("store:item", `failed to add repo ${parsed.repoUrl}`, err);
        continue;
      }
    }
    try {
      await _installItem(parsed.repoUrl, parsed.itemPath, parsed.type);
    } catch (err) {
      logger.warn("store:item", `install failed for ${parsed.itemPath}`, err);
    }
  }
}

const ENGINE_TYPE_STRING_RE = /export\s+const\s+type\s*=\s*["']([^"']+)["']/;
const ENGINE_TYPE_ARRAY_RE =
  /export\s+const\s+type\s*=\s*\[([^\]]+)\]/;
const engineTypesCache = new Map<string, string[] | null>();

const parseEngineTypesFromSource = (src: string): string[] | null => {
  const strMatch = ENGINE_TYPE_STRING_RE.exec(src);
  if (strMatch) return [strMatch[1].trim()];
  const arrMatch = ENGINE_TYPE_ARRAY_RE.exec(src);
  if (!arrMatch) return null;
  const types = arrMatch[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
  return types.length > 0 ? types : null;
};

const catalogPrimaryType = (types: string[]): string =>
  types.length > 0 ? types[0] : "web";

const readEngineTypes = async (dir: string): Promise<string[] | null> => {
  if (engineTypesCache.has(dir)) return engineTypesCache.get(dir) ?? null;
  let result: string[] | null = null;
  for (const file of ["index.js", "index.ts"]) {
    try {
      const src = await readFile(join(dir, file), "utf-8");
      result = parseEngineTypesFromSource(src);
      if (result) break;
    } catch (err) {
      logger.debug("store:item", `engine type file ${file} read failed in ${dir}`, err);
      continue;
    }
  }
  engineTypesCache.set(dir, result);
  return result;
};

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
    } catch (err) {
      logger.warn("store:item", `package.json read failed for ${repo.localPath}`, err);
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
        minDegoogVersion?: string;
      }>,
    ) => {
      for (const ent of entries) {
        const itemPath = ent.path.replace(/\/$/, "");
        const fullPath = join(repoPath, itemPath);
        try {
          const st = await stat(fullPath);
          if (!st.isDirectory()) continue;
        } catch (err) {
          logger.debug("store:item", `item path stat failed ${fullPath}`, err);
          continue;
        }
        const author = await readAuthorJson(fullPath);
        const screenshots = await listScreenshots(fullPath);
        const key = `${normalizeRepoUrl(repo.url)}::${type}::${itemPath}`;
        const inst = installedMap.get(key);
        const folderName = itemPath.split("/").pop() ?? itemPath;
        const isInstalled = installedSet.has(key);
        const repoVersion = ent.version ?? "0.0.0";
        const minDegoogVersion = ent.minDegoogVersion;
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
          ...(minDegoogVersion
            ? {
                minDegoogVersion,
                requiresNewerVersion: !isVersionAtLeast(
                  getAppVersion(),
                  minDegoogVersion,
                ),
              }
            : {}),
        };
        if (type === ExtensionStoreType.Plugin && ent.type)
          item.pluginType = ent.type;
        if (type === ExtensionStoreType.Engine) {
          const manifestTypes = ent.type
            ? ent.type
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : null;
          const fileTypes = await readEngineTypes(fullPath);
          const types =
            manifestTypes && manifestTypes.length > 0
              ? manifestTypes
              : fileTypes && fileTypes.length > 0
                ? fileTypes
                : ["web"];
          item.engineTypes = types;
          item.engineType = catalogPrimaryType(types);
        }
        items.push(item);
      }
    };

    if (pkg.plugins) await push(ExtensionStoreType.Plugin, pkg.plugins);
    if (pkg.themes) await push(ExtensionStoreType.Theme, pkg.themes);
    if (pkg.engines) await push(ExtensionStoreType.Engine, pkg.engines);
    if (pkg.transports)
      await push(ExtensionStoreType.Transport, pkg.transports);
    if (pkg.autocomplete)
      await push(ExtensionStoreType.Autocomplete, pkg.autocomplete);
  }

  return items;
}

export function installItem(
  repoUrl: string,
  itemPath: string,
  type: ExtensionStoreType,
): Promise<void> {
  return _storeMutex(() => _installItem(repoUrl, itemPath, type));
}

async function _installItem(
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
  )
    return;
  _installingSet.add(key);
  try {
    const storeDir = getStoreDir();
    const srcDir = join(storeDir, repo.localPath, normalizedPath);
    const repoBase = resolve(join(storeDir, repo.localPath));
    if (!resolve(srcDir).startsWith(repoBase + "/"))
      throw new Error("Invalid item path.");
    try {
      await stat(srcDir);
    } catch (err) {
      logger.debug("store:item", `item path not found ${srcDir}`, err);
      throw new Error("Item path not found in repository.");
    }
    const pkg = JSON.parse(
      await readFile(join(storeDir, repo.localPath, "package.json"), "utf-8"),
    ) as RepoPackageJson;
    const entries = getEntriesForType(pkg, type);
    const manifest = entries?.find(
      (e) => e.path.replace(/\/$/, "") === normalizedPath,
    );
    if (!manifest) throw new Error("Item not listed in package.json.");
    if (manifest.dependencies?.length)
      await installDependencies(manifest.dependencies);
    const freshData = await readReposData();
    const itemFolder = normalizedPath.split("/").pop() ?? normalizedPath;
    const { author, name } = repoAuthorAndName(repo.url);
    const folderName = canonicalInstalledFolder(
      type,
      `${author}-${name}-${slugifyIdPart(itemFolder)}`,
    );
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
    freshData.installed.push({
      repoUrl: repo.url,
      type,
      itemPath: normalizedPath,
      installedAs: folderName,
      installedAt: new Date().toISOString(),
      version: manifest.version ?? "0.0.0",
      ...(manifest.minDegoogVersion
        ? { minDegoogVersion: manifest.minDegoogVersion }
        : {}),
    });
    await writeReposData(freshData);
    await reloadAfterAction(type);
  } finally {
    _installingSet.delete(key);
  }
}

export function uninstallItem(
  repoUrl: string,
  itemPath: string,
  type: ExtensionStoreType,
): Promise<void> {
  return _storeMutex(() => _uninstallItem(repoUrl, itemPath, type));
}

async function _uninstallItem(
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
  for (const id of settingsIdsForInstalled(type, inst.installedAs))
    await removeSettings(id);
  data.installed = data.installed.filter((i) => i !== inst);
  await writeReposData(data);
  await reloadAfterAction(type);
}

export function updateItem(
  repoUrl: string,
  itemPath: string,
  type: ExtensionStoreType,
): Promise<void> {
  return _storeMutex(() => _updateItem(repoUrl, itemPath, type));
}

async function _updateItem(
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
  } catch (err) {
    logger.debug("store:item", `item path not found ${srcDir}`, err);
    throw new Error("Item path not found in repository.");
  }
  const pkg = JSON.parse(
    await readFile(join(storeDir, repo.localPath, "package.json"), "utf-8"),
  ) as RepoPackageJson;
  const entries = getEntriesForType(pkg, type);
  const manifest = entries?.find(
    (e) => e.path.replace(/\/$/, "") === normalizedPath,
  );
  const destBase = getDestDir(type);
  const destDir = join(destBase, inst.installedAs);
  const lowerTarget = inst.installedAs.toLowerCase();
  const siblings = await readdir(destBase).catch(() => [] as string[]);
  for (const entry of siblings) {
    if (entry.toLowerCase() === lowerTarget) {
      await rm(join(destBase, entry), { recursive: true, force: true }).catch(() => {});
    }
  }
  await copyItemDir(srcDir, destDir, STORE_METADATA);
  if (manifest?.version) inst.version = manifest.version;
  if (manifest?.minDegoogVersion)
    inst.minDegoogVersion = manifest.minDegoogVersion;
  await writeReposData(data);
  await reloadAfterAction(type);
}

export async function updateAllItems(): Promise<{ updated: number }> {
  const items = await listRepoItems();
  const updatable = items.filter((i) => i.updateAvailable);
  for (const item of updatable)
    await updateItem(item.repoUrl, item.path, item.type);
  return { updated: updatable.length };
}

export async function getInstalledItems(): Promise<InstalledItem[]> {
  const data = await readReposData();
  return data.installed;
}
