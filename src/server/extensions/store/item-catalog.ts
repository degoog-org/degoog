import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { isVersionAtLeast, getAppVersion } from "../../../shared/utils/version";
import { ExtensionStoreType } from "../../types/extension";
import type { RepoPackageJson, StoreItem } from "../../types/store";
import {
  normalizeRepoUrl,
  getStoreDir,
  readReposData,
  getRepoByUrl,
} from "./persistence";
import { logger } from "../../utils/logger";
import { STORE_TYPE_SPECS } from "./store-types";
import { readAuthorJson, listScreenshots } from "./item-files";
import {
  readEngineTypes,
  readNeedsAppRestart,
  readShortcutMeta,
} from "./item-metadata";
import { primaryType } from "../../../shared/search-types";

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
      logger.warn(
        "store:item",
        `package.json read failed for ${repo.localPath}`,
        err,
      );
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
        if (type === ExtensionStoreType.Shortcut) {
          const meta = await readShortcutMeta(fullPath);
          if (meta) {
            item.shortcutBinding = meta.binding;
            item.shortcutKind = meta.kind;
          }
        }
        if (await readNeedsAppRestart(fullPath)) item.needsAppRestart = true;
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
          item.engineType = primaryType(types);
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
    if (pkg.shortcuts) await push(ExtensionStoreType.Shortcut, pkg.shortcuts);
  }

  if (!repoUrl) {
    const catalogKeys = new Set(
      items.map((i) => `${normalizeRepoUrl(i.repoUrl)}::${i.type}::${i.path}`),
    );
    for (const inst of data.installed) {
      const key = `${normalizeRepoUrl(inst.repoUrl)}::${inst.type}::${inst.itemPath}`;
      if (catalogKeys.has(key)) continue;
      const displayName = inst.itemPath.split("/").pop() ?? inst.installedAs;
      const repoLabel =
        inst.repoUrl.replace(/\.git$/, "").split("/").pop() ?? inst.repoUrl;
      items.push({
        repoUrl: inst.repoUrl,
        repoSlug: "",
        repoName: repoLabel,
        type: inst.type,
        path: inst.itemPath,
        name: displayName,
        description: "",
        version: inst.version,
        author: null,
        screenshots: [],
        installed: true,
        installedVersion: inst.version,
        updateAvailable: false,
        orphaned: true,
      });
    }

    const managedFolders = new Set(data.installed.map((i) => i.installedAs));
    for (const type of Object.values(ExtensionStoreType)) {
      const destDir = STORE_TYPE_SPECS[type].destDir();
      let entries: string[];
      try {
        entries = await readdir(destDir);
      } catch {
        continue;
      }
      for (const folderName of entries) {
        if (folderName.startsWith(".")) continue;
        if (managedFolders.has(folderName)) continue;
        try {
          const s = await stat(join(destDir, folderName));
          if (!s.isDirectory()) continue;
        } catch {
          continue;
        }
        items.push({
          repoUrl: "",
          repoSlug: "",
          repoName: "",
          type,
          path: folderName,
          name: folderName,
          description: "",
          version: "",
          author: null,
          screenshots: [],
          installed: true,
          orphaned: true,
          untracked: true,
        });
      }
    }
  }

  return items;
}
