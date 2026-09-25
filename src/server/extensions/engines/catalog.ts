import type { SearchEngine } from "../../types/extension";
import type { EngineConfig, ImageFilter } from "../../types/search";
import type { SettingField } from "../../../shared/setting-field";
import {
  asString,
  getSettings,
  isDisabled,
  asBoolean,
  type SettingValue,
} from "../../utils/settings/plugin-settings";
import { defaultEnginesFile } from "../../utils/paths";
import { readFileSync } from "fs";
import { logger } from "../../utils/logger";
import { getInstanceSettings } from "../../utils/settings/server-settings";
import { DEGOOG_ENGINE_ID } from "./builtins/degoog";
import type { EngineFilters } from "../../../shared/engine-filters";
import { engineOrigin, storeOrigins } from "./origins";
import { manifestOf, type AnyEngineEntry, type EngineCatalogEntry } from "./entries";
import { allEngineEntries } from "./loader";
import {
  configureEngine,
  engineRequiresConfig,
  hasRequiredConfig,
  mergedSettings,
} from "./engine-settings";
import {
  resolveEngineTypes,
  resolveTabSearchType,
} from "./search-types";
import { primaryType } from "../../../shared/search-types";

export const getEngineSettingsView = async (
  engineId: string,
): Promise<Record<string, SettingValue>> => {
  const entry = allEngineEntries().find((e) => e.id === engineId);
  return entry ? mergedSettings(entry) : getSettings(engineId);
};

export const reconfigureManifestEngines = async (
  settingsId: string,
): Promise<void> => {
  for (const entry of allEngineEntries()) {
    const manifest = manifestOf(entry);
    if (!manifest) continue;
    if (manifest.id !== settingsId && entry.id !== settingsId) continue;
    try {
      await configureEngine(entry);
    } catch (err) {
      logger.error(
        "engines",
        `failed to reconfigure ${entry.id} from ${settingsId}`,
        err,
      );
    }
  }
};

export const getEngineByManifestId = (
  manifestId: string,
): SearchEngine | null =>
  allEngineEntries().find((e) => manifestOf(e)?.id === manifestId)?.instance ??
  null;

export const manifestEngineSchema = (manifestId: string): SettingField[] => {
  const seen = new Set<string>();
  const out: SettingField[] = [];
  for (const entry of allEngineEntries()) {
    const manifest = manifestOf(entry);
    if (manifest?.id !== manifestId) continue;
    for (const field of manifest.settingsSchema ?? []) {
      if (seen.has(field.key)) continue;
      seen.add(field.key);
      out.push(field);
    }
  }
  return out;
};

const isEngineEnabled = (
  id: string,
  config: EngineConfig,
  indexerOn: boolean,
): boolean => {
  if (id === DEGOOG_ENGINE_ID && !indexerOn) return false;
  if (id in config) return !!config[id];
  return indexerOn && id === DEGOOG_ENGINE_ID;
};

export const listEngines = async (): Promise<EngineCatalogEntry[]> => {
  const origins = await storeOrigins();
  return Promise.all(
    allEngineEntries().map(async (e) => {
      const searchTypes = await resolveEngineTypes(e);
      return {
        id: e.id,
        displayName: e.displayName,
        disabledByDefault: e.disabledByDefault,
        searchTypes,
        primaryType: primaryType(searchTypes),
        filters: e.filters,
        origin: engineOrigin(e, origins),
      };
    }),
  );
};

export const getEngineMap = (): Record<string, SearchEngine> =>
  Object.fromEntries(allEngineEntries().map((e) => [e.id, e.instance]));

export const honorsImageFilters = (
  filters: EngineFilters | undefined,
  imageFilter?: ImageFilter,
): boolean => {
  const active = Object.entries(
    (imageFilter ?? {}) as Record<string, string | undefined>,
  ).filter(([, value]) => value && value !== "any") as [string, string][];
  if (active.length === 0) return true;
  if (!filters) return false;
  return active.every(([group, value]) => (filters[group] ?? []).includes(value));
};

export const getEnginesForCustomType = async (
  engineType: string,
  config?: EngineConfig,
  imageFilter?: ImageFilter,
): Promise<{ id: string; instance: SearchEngine }[]> => {
  const results: { id: string; instance: SearchEngine }[] = [];
  const settings = await getInstanceSettings();
  const indexerOn = asBoolean(settings.degoogIndexerEnabled);
  for (const e of allEngineEntries()) {
    const enabled = !config || isEngineEnabled(e.id, config, indexerOn);
    if (!enabled) continue;
    if (await isDisabled(e.id)) continue;
    if (!honorsImageFilters(e.filters, imageFilter)) continue;
    const types = await resolveEngineTypes(e);
    if (types.includes(engineType))
      results.push({ id: e.id, instance: e.instance });
  }
  return results;
};

export const getCustomEngineTypes = async (): Promise<string[]> => {
  const types = new Set<string>();
  for (const e of allEngineEntries()) {
    if (await isDisabled(e.id)) continue;
    for (const t of await resolveEngineTypes(e)) {
      if (t !== "web") types.add(t);
    }
  }
  return [...types];
};

export const getInstalledSearchTypes = async (
  excludeId?: string,
): Promise<string[]> => {
  const types = new Set<string>();
  for (const e of allEngineEntries()) {
    if (excludeId && e.id === excludeId) continue;
    if (await isDisabled(e.id)) continue;
    for (const t of await resolveEngineTypes(e)) types.add(t);
  }
  return [...types];
};

export const getEngineSearchType = async (
  engineId: string,
  preferredTab?: string,
): Promise<string | null> => {
  const plugin = allEngineEntries().find((e) => e.id === engineId);
  if (!plugin) return null;
  const types = await resolveEngineTypes(plugin);
  return resolveTabSearchType(types, preferredTab);
};

export const getActiveWebEngines = async (
  config: EngineConfig,
): Promise<{ id: string; instance: SearchEngine; score: number }[]> => {
  const settings = await getInstanceSettings();
  const indexerOn = asBoolean(settings.degoogIndexerEnabled);
  const active: { id: string; instance: SearchEngine; score: number }[] = [];
  for (const e of allEngineEntries()) {
    const enabled = isEngineEnabled(e.id, config, indexerOn);
    if (!enabled) continue;
    const types = await resolveEngineTypes(e);
    if (!types.includes("web")) continue;
    if (engineRequiresConfig(e.instance) && !(await hasRequiredConfig(e)))
      continue;
    const stored = await getSettings(e.id);
    const score = Math.max(parseFloat(asString(stored["score"])) || 1, 0.1);
    active.push({ id: e.id, instance: e.instance, score });
  }
  return active;
};

const _loadDefaultEngineOverrides = (): Record<string, boolean> => {
  try {
    const raw = readFileSync(defaultEnginesFile(), "utf-8");
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    logger.debug(
      "engines",
      "No default engines file found, returning empty object.",
    );
    return {};
  }
};

export const getDefaultEngineConfig = (): Record<string, boolean> => {
  const engineMap = getEngineMap();
  const overrides = _loadDefaultEngineOverrides();
  return Object.fromEntries(
    allEngineEntries().map((e: AnyEngineEntry) => {
      if (e.id in overrides) return [e.id, overrides[e.id]];
      const instance = engineMap[e.id];
      const disabledByDefault =
        instance &&
        (engineRequiresConfig(instance) || e.disabledByDefault === true);
      return [e.id, !disabledByDefault];
    }),
  );
};

export const getEngineIdByInstance = (
  instance: SearchEngine,
): string | undefined => {
  for (const e of allEngineEntries()) {
    if (e.instance === instance) return e.id;
  }
  return undefined;
};

export const getEngineDefaultTransport = (
  engineId: string,
): string | undefined => {
  const instance = getEngineMap()[engineId];
  const field = instance?.settingsSchema?.find(
    (f) => f.key === "outgoingTransport",
  );
  return field?.default ?? undefined;
};
