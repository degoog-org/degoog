import { existsSync } from "fs";
import { pluginSettingsFile } from "../paths";
import { writeJsonAtomic } from "../storage/atomic-json";
import { readJsonOrQuarantine } from "../storage/read-json";
import { createMutex } from "../cache/mutex";
import { logger } from "../logger";
import {
  INVALIDATE_SCOPE,
  onInvalidate,
  publishInvalidate,
} from "../cache/cache-valkey";

type PluginSettingsStore = Record<string, Record<string, SettingValue>>;
export type SettingValue = string | string[] | boolean;

export const asString = (v: SettingValue | undefined): string => {
  if (v === undefined || v === null) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return typeof v === "string" ? v : (v[0] ?? "");
};

export const asBoolean = (v: SettingValue | undefined): boolean =>
  v === true || v === "true";
let cache: PluginSettingsStore | null = null;
let loadFailed = false;
let unreadable = false;
const writeLock = createMutex();

onInvalidate((payload) => {
  if (payload.scope !== INVALIDATE_SCOPE.PLUGIN_SETTINGS) return;
  cache = null;
});

const _lowerKeys = (store: PluginSettingsStore): PluginSettingsStore => {
  const out: PluginSettingsStore = {};
  for (const [k, v] of Object.entries(store)) {
    if (k.startsWith("__")) {
      out[k] = v;
      continue;
    }
    const lower = k.toLowerCase();
    out[lower] = out[lower] ? { ...v, ...out[lower] } : v;
  }
  return out;
};

const load = async (): Promise<PluginSettingsStore> => {
  if (cache) return cache;
  const file = pluginSettingsFile();
  try {
    const existed = existsSync(file);
    const parsed = await readJsonOrQuarantine<PluginSettingsStore>("plugin-settings", file);
    unreadable = false;
    loadFailed = parsed === null && existed;
    cache = parsed ? _lowerKeys(parsed) : {};
    return cache;
  } catch (err) {
    logger.error("plugin-settings", "plugin-settings.json could not be read", err);
    unreadable = true;
    loadFailed = true;
    return {};
  }
};

export const didSettingsLoadFail = (): boolean => loadFailed;

export const clearPluginSettingsCache = (): void => {
  cache = null;
};

async function persist(store: PluginSettingsStore): Promise<void> {
  if (unreadable) {
    throw new Error("plugin-settings.json is unreadable, refusing to overwrite it");
  }
  await writeJsonAtomic(pluginSettingsFile(), store);
}

export const getSettings = async (
  id: string,
): Promise<Record<string, SettingValue>> => {
  const store = await load();
  return store[id] ?? {};
};

export const isDisabled = async (id: string): Promise<boolean> => {
  const settings = await getSettings(id);
  return asBoolean(settings["disabled"]);
};

export const mergeDefaults = (
  stored: Record<string, SettingValue>,
  schema: Array<{ key: string; default?: unknown }>,
): Record<string, SettingValue> => {
  const out: Record<string, SettingValue> = {};
  for (const field of schema) {
    if (field.default !== undefined && field.default !== null) {
      out[field.key] = field.default as SettingValue;
    }
  }

  return { ...out, ...stored };
};

export function setSettings(
  id: string,
  values: Record<string, SettingValue>,
): Promise<void> {
  return writeLock(async () => {
    const store = await load();
    store[id] = { ...(store[id] ?? {}), ...values };
    await persist(store);
    cache = store;
    loadFailed = false;
    await publishInvalidate(INVALIDATE_SCOPE.PLUGIN_SETTINGS, id);
  });
}

export const SCHEMA_VERSION_KEY = "__schemaVersion";

export const getSchemaVersion = async (): Promise<number> => {
  const store = (await load()) as Record<string, unknown>;
  const version = store[SCHEMA_VERSION_KEY];
  return typeof version === "number" ? version : 0;
};

function _setMeta(key: `__${string}`, value: unknown): Promise<void> {
  return writeLock(async () => {
    const store = await load();
    (store as Record<string, unknown>)[key] = value;
    await persist(store);
    cache = store;
    loadFailed = false;
    await publishInvalidate(INVALIDATE_SCOPE.PLUGIN_SETTINGS, key);
  });
}

export function setSchemaVersion(version: number): Promise<void> {
  return _setMeta(SCHEMA_VERSION_KEY, version);
}

export const getMetaList = async (key: `__${string}`): Promise<string[]> => {
  const value = ((await load()) as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
};

export function setMetaList(key: `__${string}`, values: string[]): Promise<void> {
  return _setMeta(key, values);
}

export const getAllSettings = async (): Promise<PluginSettingsStore> => {
  return load();
};

const TYPE_OVERRIDE_KEY = "searchTypeOverride";

export const getTypeOverride = async (id: string): Promise<string | null> => {
  const settings = await getSettings(id);
  const v = settings[TYPE_OVERRIDE_KEY];
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

export function removeSettings(id: string): Promise<void> {
  return writeLock(async () => {
    const store = await load();
    if (!(id in store)) return;
    delete store[id];
    await persist(store);
    cache = store;
    await publishInvalidate(INVALIDATE_SCOPE.PLUGIN_SETTINGS, id);
  });
}

export function removeSettingKeys(id: string, keys: string[]): Promise<void> {
  return writeLock(async () => {
    const store = await load();
    const current = store[id];
    if (!current || !keys.some((key) => key in current)) return;
    store[id] = Object.fromEntries(
      Object.entries(current).filter(([key]) => !keys.includes(key)),
    );
    await persist(store);
    cache = store;
    await publishInvalidate(INVALIDATE_SCOPE.PLUGIN_SETTINGS, id);
  });
}

export const maskSecrets = (
  settings: Record<string, SettingValue>,
  schema: { key: string; secret?: boolean }[],
): Record<string, SettingValue> => {
  const masked: Record<string, SettingValue> = {};
  for (const [key, value] of Object.entries(settings)) {
    const field = schema.find((f) => f.key === key);
    masked[key] = field?.secret ? (value ? "__SET__" : "") : value;
  }

  return masked;
};

export const mergeSecrets = (
  incoming: Record<string, SettingValue>,
  existing: Record<string, SettingValue>,
  schema: { key: string; secret?: boolean }[],
): Record<string, SettingValue> => {
  const merged: Record<string, SettingValue> = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    const field = schema.find((f) => f.key === key);
    if (field?.secret) {
      if (value === "__SET__") continue;
      merged[key] = value;
    } else {
      merged[key] = value;
    }
  }

  return merged;
};
