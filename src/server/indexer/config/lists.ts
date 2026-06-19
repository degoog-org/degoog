import { readFile } from "fs/promises";
import { indexerConfigFile } from "../../utils/paths";
import { writeJsonAtomic } from "../../utils/atomic-json";
import {
  getInstanceSettings,
  type ServerSettingValue,
} from "../../utils/server-settings";
import { asString } from "../../utils/plugin-settings";
import { logger } from "../../utils/logger";
import {
  INVALIDATE_SCOPE,
  onInvalidate,
  publishInvalidate,
} from "../../utils/cache-valkey";
import { OVERSIZED_TEXT_FIELDS } from "../../../shared/indexer";

export type IndexerListKey = (typeof OVERSIZED_TEXT_FIELDS)[number];
export type IndexerLists = Record<IndexerListKey, string>;

type CacheState =
  | { source: "file"; lists: IndexerLists }
  | { source: "settings"; settings: object; lists: IndexerLists };

let _cache: CacheState | null = null;

onInvalidate((payload) => {
  if (payload.scope !== INVALIDATE_SCOPE.SERVER_SETTINGS) return;
  _cache = null;
});

const emptyLists = (): IndexerLists => ({
  degoogIndexerDomainAllowlist: "",
  degoogIndexerDomainBlocklist: "",
  degoogIndexerWordBlocklist: "",
});

const fromSettings = (s: Record<string, ServerSettingValue>): IndexerLists => {
  const lists = emptyLists();
  for (const key of OVERSIZED_TEXT_FIELDS) lists[key] = asString(s[key]);
  return lists;
};

const fromFile = (raw: string): IndexerLists => {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const lists = emptyLists();
  for (const key of OVERSIZED_TEXT_FIELDS) {
    const value = parsed[key];
    if (typeof value === "string") lists[key] = value;
  }
  return lists;
};

export const isIndexerListKey = (key: string): key is IndexerListKey =>
  (OVERSIZED_TEXT_FIELDS as readonly string[]).includes(key);

export const readIndexerLists = async (): Promise<IndexerLists> => {
  if (_cache?.source === "file") return _cache.lists;
  const s = await getInstanceSettings();
  if (_cache?.source === "settings" && _cache.settings === s) return _cache.lists;
  try {
    _cache = { source: "file", lists: fromFile(await readFile(indexerConfigFile(), "utf-8")) };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      logger.error(
        "indexer-config",
        "failed to read indexer-config.json; falling back to legacy settings",
        err,
      );
    }
    _cache = { source: "settings", settings: s, lists: fromSettings(s) };
  }
  return _cache.lists;
};

export const writeIndexerList = async (
  key: IndexerListKey,
  value: string,
): Promise<void> => {
  const current = await readIndexerLists();
  const next: IndexerLists = { ...current, [key]: value };
  await writeJsonAtomic(indexerConfigFile(), next);
  _cache = { source: "file", lists: next };
  await publishInvalidate(INVALIDATE_SCOPE.SERVER_SETTINGS);
};
