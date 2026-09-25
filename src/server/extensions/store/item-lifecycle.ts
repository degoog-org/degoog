import { readFile, mkdir, readdir, rm, stat } from "fs/promises";
import { join } from "path";
import { removeSettings } from "../../utils/settings/plugin-settings";
import { ExtensionStoreType } from "../../types/extension";
import type {
  InstalledItem,
  RepoPackageItem,
  RepoPackageJson,
  ReposData,
} from "../../types/store";
import {
  normalizeRepoUrl,
  getStoreDir,
  readReposData,
  writeReposData,
  getRepoByUrl,
} from "./persistence";
import { _addRepo } from "./repo-ops";
import { STORE_TYPE_SPECS } from "./store-types";
import type { StoreStreamPhase } from "../../../shared/store-stream";
import { runStoreExclusive } from "./store-lock";
import { resolveChild } from "../../utils/paths";
import { logger } from "../../utils/logger";
import { markRestartPending } from "../../utils/extension-support/restart-state";
import {
  slugifyIdPart,
  repoAuthorAndName,
  stageItemDir,
  resolveStoreItemDir,
} from "./item-files";
import {
  getDestDir,
  canonicalInstalledFolder,
  settingsIdsForInstalled,
  getEntriesForType,
  reloadAfterAction,
  parseDependencyUrl,
} from "./item-specs";
import {
  clearNeedsAppRestart,
  readNeedsAppRestart,
} from "./item-metadata";
import { listRepoItems } from "./item-catalog";

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
        repo = await _addRepo(parsed.repoUrl);
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

const _loadSourceItem = async (
  repoLocalPath: string,
  normalizedPath: string,
  type: ExtensionStoreType,
): Promise<{ srcDir: string; manifest: RepoPackageItem | undefined }> => {
  const repoDir = join(getStoreDir(), repoLocalPath);
  const srcDir = await resolveStoreItemDir(repoDir, normalizedPath);
  const pkg = JSON.parse(
    await readFile(join(repoDir, "package.json"), "utf-8"),
  ) as RepoPackageJson;
  const manifest = getEntriesForType(pkg, type)?.find(
    (e) => e.path.replace(/\/$/, "") === normalizedPath,
  );
  return { srcDir, manifest };
};

const _findInstalled = (
  data: ReposData,
  repoUrl: string,
  type: ExtensionStoreType,
  normalizedPath: string,
): InstalledItem => {
  const inst = data.installed.find(
    (i) =>
      normalizeRepoUrl(i.repoUrl) === normalizeRepoUrl(repoUrl) &&
      i.type === type &&
      i.itemPath === normalizedPath,
  );
  if (!inst) throw new Error("Item is not installed.");
  return inst;
};

const _noteRestart = async (destDir: string, reason: string): Promise<void> => {
  clearNeedsAppRestart(destDir);
  if (await readNeedsAppRestart(destDir)) markRestartPending(reason);
};

export function installItem(
  repoUrl: string,
  itemPath: string,
  type: ExtensionStoreType,
): Promise<void> {
  return runStoreExclusive(() => _installItem(repoUrl, itemPath, type));
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
    const { srcDir, manifest } = await _loadSourceItem(repo.localPath, normalizedPath, type);
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
    await stageItemDir(srcDir, destBase, folderName);
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
    await _noteRestart(destDir, `${type} "${manifest.name ?? folderName}" was installed`);
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
  return runStoreExclusive(() => _uninstallItem(repoUrl, itemPath, type));
}

async function _uninstallItem(
  repoUrl: string,
  itemPath: string,
  type: ExtensionStoreType,
): Promise<void> {
  const data = await readReposData();
  const normalizedPath = itemPath.replace(/\/$/, "");
  const inst = _findInstalled(data, repoUrl, type, normalizedPath);
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
  return runStoreExclusive(() => _updateItem(repoUrl, itemPath, type));
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
  const inst = _findInstalled(data, repoUrl, type, normalizedPath);
  const { srcDir, manifest } = await _loadSourceItem(repo.localPath, normalizedPath, type);
  const destBase = getDestDir(type);
  const destDir = join(destBase, inst.installedAs);
  const lowerTarget = inst.installedAs.toLowerCase();
  await stageItemDir(srcDir, destBase, inst.installedAs, async () => {
    const siblings = await readdir(destBase).catch(() => [] as string[]);
    for (const entry of siblings) {
      if (entry.toLowerCase() === lowerTarget) {
        await rm(join(destBase, entry), { recursive: true, force: true }).catch(
          () => {},
        );
      }
    }
  });
  if (manifest?.version) inst.version = manifest.version;
  if (manifest?.minDegoogVersion)
    inst.minDegoogVersion = manifest.minDegoogVersion;
  await writeReposData(data);
  await _noteRestart(destDir, `${type} "${manifest?.name ?? inst.installedAs}" was updated`);
  await reloadAfterAction(type);
}

interface UpdateItemProgress {
  repoUrl: string;
  itemPath: string;
  name: string;
  type: ExtensionStoreType;
  i: number;
  total: number;
  phase: StoreStreamPhase;
  error?: string;
}

export async function updateAllItems(
  onProgress?: (p: UpdateItemProgress) => void,
): Promise<{ updated: number; failed: number }> {
  return runStoreExclusive(async () => {
    const items = await listRepoItems();
    const updatable = items.filter((i) => i.updateAvailable);
    const total = updatable.length;
    let updated = 0;
    let failed = 0;
    for (let idx = 0; idx < total; idx++) {
      const item = updatable[idx];
      const base = {
        repoUrl: item.repoUrl,
        itemPath: item.path,
        name: item.name,
        type: item.type,
        i: idx + 1,
        total,
      };
      onProgress?.({ ...base, phase: "start" });
      try {
        await _updateItem(item.repoUrl, item.path, item.type);
        updated++;
        onProgress?.({ ...base, phase: "ok" });
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : "Update failed";
        logger.warn("store:item", `update-all failed for ${item.name}`, err);
        onProgress?.({ ...base, phase: "failed", error: message });
      }
    }
    return { updated, failed };
  });
}

export async function getInstalledItems(): Promise<InstalledItem[]> {
  const data = await readReposData();
  return data.installed;
}

export function deleteUntracked(
  type: ExtensionStoreType,
  folderName: string,
): Promise<void> {
  return runStoreExclusive(() => _deleteUntracked(type, folderName));
}

async function _deleteUntracked(
  type: ExtensionStoreType,
  folderName: string,
): Promise<void> {
  const target = resolveChild(
    STORE_TYPE_SPECS[type].destDir(),
    folderName,
  );
  if (!target) throw new Error("Invalid folder name.");
  await rm(target, { recursive: true, force: true });
  await reloadAfterAction(type);
}
