import type { PluginManifest, SearchEngine } from "../../types/extension";
import type { SettingField } from "../../../shared/setting-field";
import {
  getSettings,
  mergeDefaults,
  type SettingValue,
} from "../../utils/settings/plugin-settings";
import { manifestOf, type AnyEngineEntry } from "./entries";

export const engineFullSchema = (instance: SearchEngine): SettingField[] => {
  const own = instance.settingsSchema ?? [];
  const shared = (instance.pluginManifest?.settingsSchema ?? []).filter(
    (f) => !own.some((o) => o.key === f.key),
  );
  return [...own, ...shared];
};

const sharedValues = async (
  manifest: PluginManifest,
): Promise<Record<string, SettingValue>> => {
  const shared = await getSettings(manifest.id);
  const picked: Record<string, SettingValue> = {};
  for (const field of manifest.settingsSchema ?? []) {
    if (field.key in shared) picked[field.key] = shared[field.key];
  }
  return picked;
};

export const mergedSettings = async (
  entry: AnyEngineEntry,
): Promise<Record<string, SettingValue>> => {
  const own = await getSettings(entry.id);
  const manifest = manifestOf(entry);
  if (!manifest) return own;
  return { ...own, ...(await sharedValues(manifest)) };
};

export const configureEngine = async (entry: AnyEngineEntry): Promise<void> => {
  const { instance } = entry;
  const schema = engineFullSchema(instance);
  if (!instance.configure || schema.length === 0) return;
  instance.configure(mergeDefaults(await mergedSettings(entry), schema));
};

export const engineRequiresConfig = (engine: SearchEngine): boolean =>
  engineFullSchema(engine).some((f) => f.required === true);

export const hasRequiredConfig = async (
  entry: AnyEngineEntry,
): Promise<boolean> => {
  const requiredKeys = engineFullSchema(entry.instance)
    .filter((f) => f.required)
    .map((f) => f.key);
  if (requiredKeys.length === 0) return true;
  const stored = await mergedSettings(entry);
  return requiredKeys.every((k) => {
    const v = stored[k];
    if (Array.isArray(v)) return v.length > 0;
    return typeof v === "string" && v.trim() !== "";
  });
};
