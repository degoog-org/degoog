import type { PluginManifest, SearchEngine } from "../../types/extension";
import type { SettingField } from "../../../shared/setting-field";
import type { EngineFilters } from "../../../shared/engine-filters";
import type { EngineOrigin } from "../../../shared/engine-origins";
import type { RegistrySource } from "../registry-factory";
import type { CompatEntry } from "../compatibility-layer/registry";

export interface PluginEntry {
  id: string;
  displayName: string;
  searchTypes: string[];
  description?: string;
  site?: string;
  instance: SearchEngine;
  disabledByDefault?: boolean;
  source?: RegistrySource;
  compatibilityLayer?: string;
  filters?: EngineFilters;
  pluginManifest?: PluginManifest;
}

export type AnyEngineEntry = PluginEntry | CompatEntry;

export interface EngineCatalogEntry {
  id: string;
  displayName: string;
  disabledByDefault?: boolean;
  searchTypes: string[];
  primaryType: string;
  filters?: EngineFilters;
  origin: EngineOrigin;
}

export const manifestOf = (
  entry: AnyEngineEntry,
): PluginManifest | undefined => entry.instance.pluginManifest;

export const manifestKeys = (entry: AnyEngineEntry): Set<string> =>
  new Set(
    (manifestOf(entry)?.settingsSchema ?? []).map((f: SettingField) => f.key),
  );
