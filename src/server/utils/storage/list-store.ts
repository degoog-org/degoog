import { readFile } from "fs/promises";
import { writeJsonAtomic } from "./atomic-json";
import {
  getInstanceSettings,
  setInstanceSettings,
  type ServerSettingValue,
} from "../settings/server-settings";
import { asString } from "../settings/plugin-settings";
import { logger } from "../logger";
import {
  INVALIDATE_SCOPE,
  onInvalidate,
  publishInvalidate,
} from "../cache/cache-valkey";

export interface ListStore<K extends string> {
  readLists: () => Promise<Record<K, string>>;
  writeList: (key: K, value: string) => Promise<void>;
  isListKey: (key: string) => key is K;
}

interface ListStoreConfig<K extends string> {
  keys: readonly K[];
  file: () => string;
  namespace: string;
}

type CacheState<K extends string> =
  | { source: "file"; lists: Record<K, string> }
  | { source: "settings"; settings: object; lists: Record<K, string> };

/**
 * Big text lists (domain blocklists and friends) used to live inline in the
 * server settings file, which got miserable once someone pasted a few million
 * lines into it. Each list now gets its own JSON file with caching, while reads
 * still fall back to the legacy settings so existing instances migrate lazily:
 * we read both old and new locations, but only ever write the new file.
 */
export const createListStore = <K extends string>(
  config: ListStoreConfig<K>,
): ListStore<K> => {
  const { keys, file, namespace } = config;
  let cache: CacheState<K> | null = null;

  onInvalidate((payload) => {
    if (payload.scope !== INVALIDATE_SCOPE.SERVER_SETTINGS) return;
    cache = null;
  });

  const emptyLists = (): Record<K, string> => {
    const lists = {} as Record<K, string>;
    for (const key of keys) lists[key] = "";
    return lists;
  };

  const fromSettings = (
    s: Record<string, ServerSettingValue>,
  ): Record<K, string> => {
    const lists = emptyLists();
    for (const key of keys) lists[key] = asString(s[key]);
    return lists;
  };

  const fromFile = (raw: string): Record<K, string> => {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const lists = emptyLists();
    for (const key of keys) {
      const value = parsed[key];
      if (typeof value === "string") lists[key] = value;
    }
    return lists;
  };

  const isListKey = (key: string): key is K =>
    (keys as readonly string[]).includes(key);

  const readLists = async (): Promise<Record<K, string>> => {
    if (cache?.source === "file") return cache.lists;
    const s = await getInstanceSettings();
    if (cache?.source === "settings" && cache.settings === s) return cache.lists;
    try {
      cache = { source: "file", lists: fromFile(await readFile(file(), "utf-8")) };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        logger.error(
          namespace,
          "failed to read list file; falling back to legacy settings",
          err,
        );
      }
      cache = { source: "settings", settings: s, lists: fromSettings(s) };
    }
    return cache.lists;
  };

  const stripLegacy = async (): Promise<void> => {
    const settings = await getInstanceSettings();
    const present = keys.filter((k) => k in settings);
    if (present.length === 0) return;
    const next = { ...settings };
    for (const k of present) delete next[k];
    await setInstanceSettings(next);
  };

  const writeList = async (key: K, value: string): Promise<void> => {
    const current = await readLists();
    const next = { ...current, [key]: value } as Record<K, string>;
    await writeJsonAtomic(file(), next);
    await stripLegacy();
    cache = { source: "file", lists: next };
    await publishInvalidate(INVALIDATE_SCOPE.SERVER_SETTINGS);
  };

  return { readLists, writeList, isListKey };
};
