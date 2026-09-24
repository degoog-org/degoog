import { getSettings, setSettings, type SettingValue } from "./plugin-settings";
import {
  parseShortcutsMap,
  type ShortcutBinding,
  type ShortcutActionMeta,
} from "../../../shared/shortcuts";

interface ShortcutsSettings {
  bindings: Record<string, ShortcutBinding>;
}

const SETTINGS_ID = "shortcuts";
const MODIFIER_KEYS = ["ctrl", "meta", "alt", "shift"] as const;
const BINDING_KEYS = new Set<string>(["key", ...MODIFIER_KEYS]);

let cache: ShortcutsSettings | null = null;

const isBinding = (value: unknown): value is ShortcutBinding => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !BINDING_KEYS.has(key))) return false;
  if ("key" in record && typeof record.key !== "string") return false;
  for (const mod of MODIFIER_KEYS) {
    if (mod in record && typeof record[mod] !== "boolean") return false;
  }
  return true;
};

export const clearShortcutsSettingsCache = (): void => {
  cache = null;
};

export const readShortcutsSettings = async (): Promise<ShortcutsSettings> => {
  if (cache) return cache;
  const stored = await getSettings(SETTINGS_ID);
  const bindings: Record<string, ShortcutBinding> = {};
  for (const [id, raw] of Object.entries(stored)) {
    if (typeof raw !== "string") continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isBinding(parsed)) continue;
      bindings[id] = parsed;
    } catch {
      continue;
    }
  }
  cache = { bindings };
  return cache;
};

export const writeShortcutsSettings = async (
  settings: ShortcutsSettings,
): Promise<void> => {
  const stored: Record<string, SettingValue> = {};
  for (const [id, binding] of Object.entries(settings.bindings)) {
    stored[id] = JSON.stringify(binding);
  }
  await setSettings(SETTINGS_ID, stored);
  cache = settings;
};

export const saveShortcutBindings = async (
  value: unknown,
  actions: ShortcutActionMeta[],
): Promise<Record<string, ShortcutBinding> | null> => {
  const bindings = parseShortcutsMap(value, actions);
  if (!bindings) return null;
  await writeShortcutsSettings({ bindings });
  return bindings;
};
