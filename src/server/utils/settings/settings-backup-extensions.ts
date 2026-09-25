import { readFile } from "fs/promises";
import { ExtensionStoreType } from "../../types/extension";
import { addRepo } from "../../extensions/store/repo-ops";
import { installItem } from "../../extensions/store/item-lifecycle";
import {
  normalizeRepoUrl,
  readReposData,
} from "../../extensions/store/persistence";
import { syncExtSettings } from "../../extensions/settings-sync";
import {
  getAllSettings,
  setSettings,
  type SettingValue,
} from "./plugin-settings";
import { clearShortcutsSettingsCache } from "./shortcuts-settings";
import { defaultEnginesFile } from "../paths";
import { writeJsonAtomic } from "../storage/atomic-json";
import { logger } from "../logger";
import { isRecord } from "../../../shared/utils/is-record";

const TAG = "settings-backup";
const MARKER_PREFIX = "__";

type BackupExtensionItem = {
  repoUrl: string;
  type: ExtensionStoreType;
  itemPath: string;
};

export type ExtensionsBackup = {
  repos: string[];
  installed: BackupExtensionItem[];
  settings: Record<string, Record<string, SettingValue>>;
  defaultEngines: Record<string, boolean> | null;
};

export type ExtensionsRestoreResult = {
  reposAdded: number;
  extensionsInstalled: number;
  extensionsFailed: string[];
};

const _isSettingValue = (value: unknown): value is SettingValue =>
  typeof value === "string" ||
  typeof value === "boolean" ||
  (Array.isArray(value) && value.every((v) => typeof v === "string"));

const _extensionSettings = (
  store: Record<string, Record<string, SettingValue>>,
): Record<string, Record<string, SettingValue>> =>
  Object.fromEntries(
    Object.entries(store).filter(([id]) => !id.startsWith(MARKER_PREFIX)),
  );

const _itemKey = (item: BackupExtensionItem): string =>
  `${normalizeRepoUrl(item.repoUrl)}::${item.type}::${item.itemPath.replace(/\/$/, "")}`;

const _readEngineMap = (value: unknown): Record<string, boolean> => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
    ),
  );
};

const _readDefaultEngines = async (): Promise<Record<string, boolean>> => {
  try {
    const raw = await readFile(defaultEnginesFile(), "utf-8");
    return _readEngineMap(JSON.parse(raw));
  } catch (err) {
    logger.debug(TAG, "no default engines file to export", err);
    return {};
  }
};

export const collectExtensions = async (): Promise<ExtensionsBackup> => {
  const data = await readReposData();
  return {
    repos: data.repos.map((repo) => repo.url),
    installed: data.installed.map(({ repoUrl, type, itemPath }) => ({
      repoUrl,
      type,
      itemPath,
    })),
    settings: _extensionSettings(await getAllSettings()),
    defaultEngines: await _readDefaultEngines(),
  };
};

const _readItems = (value: unknown): BackupExtensionItem[] => {
  if (!Array.isArray(value)) return [];
  const types = new Set<string>(Object.values(ExtensionStoreType));
  return value.filter(
    (item): item is BackupExtensionItem =>
      isRecord(item) &&
      typeof item.repoUrl === "string" &&
      typeof item.itemPath === "string" &&
      typeof item.type === "string" &&
      types.has(item.type),
  );
};

const _readSettings = (
  value: unknown,
): Record<string, Record<string, SettingValue>> => {
  if (!isRecord(value)) return {};
  const out: Record<string, Record<string, SettingValue>> = {};
  for (const [id, values] of Object.entries(value)) {
    if (id.startsWith(MARKER_PREFIX) || !isRecord(values)) continue;
    out[id] = Object.fromEntries(
      Object.entries(values).filter(([, v]) => _isSettingValue(v)),
    ) as Record<string, SettingValue>;
  }
  return out;
};

export const readExtensionsBackup = (value: unknown): ExtensionsBackup => {
  if (!isRecord(value))
    return { repos: [], installed: [], settings: {}, defaultEngines: null };
  return {
    repos: Array.isArray(value.repos)
      ? value.repos.filter((url): url is string => typeof url === "string")
      : [],
    installed: _readItems(value.installed),
    settings: _readSettings(value.settings),
    defaultEngines: isRecord(value.defaultEngines)
      ? _readEngineMap(value.defaultEngines)
      : null,
  };
};

export const hasExtensions = (backup: ExtensionsBackup): boolean =>
  backup.repos.length > 0 ||
  backup.installed.length > 0 ||
  Object.keys(backup.settings).length > 0 ||
  backup.defaultEngines !== null;

const _restoreRepos = async (urls: string[]): Promise<number> => {
  const { repos } = await readReposData();
  const existing = new Set(repos.map((repo) => normalizeRepoUrl(repo.url)));
  let added = 0;
  for (const url of urls) {
    if (existing.has(normalizeRepoUrl(url))) continue;
    try {
      await addRepo(url);
      existing.add(normalizeRepoUrl(url));
      added += 1;
    } catch (err) {
      logger.warn(TAG, `could not add repository ${url}`, err);
    }
  }
  return added;
};

type ItemsRestored = Pick<
  ExtensionsRestoreResult,
  "extensionsInstalled" | "extensionsFailed"
>;

const _restoreItems = async (
  items: BackupExtensionItem[],
): Promise<ItemsRestored> => {
  const installed = new Set((await readReposData()).installed.map(_itemKey));
  const failed: string[] = [];
  let count = 0;
  for (const item of items) {
    if (installed.has(_itemKey(item))) continue;
    try {
      await installItem(item.repoUrl, item.itemPath, item.type);
      count += 1;
    } catch (err) {
      logger.warn(TAG, `could not install ${item.type} ${item.itemPath}`, err);
      failed.push(item.itemPath);
    }
  }
  return { extensionsInstalled: count, extensionsFailed: failed };
};

const _restoreDefaultEngines = async (
  overrides: Record<string, boolean> | null,
): Promise<void> => {
  if (!overrides) return;
  await writeJsonAtomic(defaultEnginesFile(), overrides);
};

const _restoreSettings = async (
  settings: Record<string, Record<string, SettingValue>>,
): Promise<void> => {
  for (const [id, values] of Object.entries(settings)) {
    await setSettings(id, values);
    await syncExtSettings(id, values);
  }
  if (Object.keys(settings).length > 0) clearShortcutsSettingsCache();
};

export const restoreExtensions = async (
  backup: ExtensionsBackup,
): Promise<ExtensionsRestoreResult> => {
  await _restoreSettings(backup.settings);
  await _restoreDefaultEngines(backup.defaultEngines);
  const reposAdded = await _restoreRepos(backup.repos);
  return { reposAdded, ...(await _restoreItems(backup.installed)) };
};
