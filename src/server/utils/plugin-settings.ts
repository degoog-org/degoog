import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { pluginSettingsFile } from "./paths";

const SETTINGS_PATH = pluginSettingsFile();

type PluginSettingsStore = Record<string, Record<string, SettingValue>>;
export type SettingValue = string | string[] | boolean;

export const asString = (v: SettingValue | undefined): string => {
  if (v === undefined || v === null) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return typeof v === "string" ? v : (v[0] ?? "");
};

export const asBoolean = (v: SettingValue | undefined): boolean =>
  v === true || v === "true";

export const settingsAsStrings = (
  settings: Record<string, SettingValue>,
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(settings)) {
    out[k] = asString(v);
  }
  return out;
};

let cache: PluginSettingsStore | null = null;
let loadFailed = false;

const load = async (): Promise<PluginSettingsStore> => {
  if (cache) return cache;
  try {
    const raw = await readFile(SETTINGS_PATH, "utf-8");
    cache = JSON.parse(raw) as PluginSettingsStore;
    loadFailed = false;
  } catch {
    cache = {};
    loadFailed = true;
  }
  return cache;
};

export const didSettingsLoadFail = (): boolean => loadFailed;

async function persist(store: PluginSettingsStore): Promise<void> {
  await mkdir(dirname(SETTINGS_PATH), { recursive: true });
  await writeFile(SETTINGS_PATH, JSON.stringify(store, null, 2), "utf-8");
}

export const getSettings = async (
  id: string,
): Promise<Record<string, SettingValue>> => {
  const store = await load();
  return store[id] ?? {};
};

export const dumbFallbackBecauseIDontThink = async (
  preferredId: string,
  fallbacks: string[],
): Promise<Record<string, SettingValue>> => {
  const store = await load();
  if (store[preferredId]) return store[preferredId] ?? {};
  for (const id of fallbacks) {
    if (!id || id === preferredId) continue;
    if (store[id]) return store[id] ?? {};
  }
  return {};
};

export const isDisabled = async (id: string): Promise<boolean> => {
  const settings = await getSettings(id);
  return asBoolean(settings["disabled"]);
};

export const isDisabledWithFallback = async (
  preferredId: string,
  fallbacks: string[],
): Promise<boolean> => {
  const settings = await dumbFallbackBecauseIDontThink(preferredId, fallbacks);
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

export async function setSettings(
  id: string,
  values: Record<string, SettingValue>,
): Promise<void> {
  const store = await load();
  store[id] = { ...(store[id] ?? {}), ...values };
  cache = store;

  await persist(store);
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

export const setTypeOverride = async (
  id: string,
  type: string,
): Promise<void> => {
  await setSettings(id, { [TYPE_OVERRIDE_KEY]: type.trim() });
};

export const clearTypeOverride = async (id: string): Promise<void> => {
  const store = await load();
  if (store[id]) {
    delete store[id][TYPE_OVERRIDE_KEY];
    cache = store;
    await persist(store);
  }
};

export async function removeSettings(id: string): Promise<void> {
  const store = await load();
  if (id in store) {
    delete store[id];
    cache = store;
    await persist(store);
  }
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
