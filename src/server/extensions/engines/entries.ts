import type { PluginManifest, PluginRoute, SearchEngine } from "../../types/extension";
import type { SettingField } from "../../../shared/setting-field";
import type { EngineFilters } from "../../../shared/engine-filters";
import type { EngineOrigin } from "../../../shared/engine-origins";
import { ENGINE_INPUT, type EngineInput } from "../../../shared/engine-input";
import type { RegistrySource } from "../registry-factory";
import type { CompatEntry } from "../compatibility-layer/registry";

export interface PluginEntry {
  id: string;
  displayName: string;
  searchTypes: string[];
  description?: string;
  site?: string;
  instance: SearchEngine;
  folder?: string;
  routes?: PluginRoute[];
  disabledByDefault?: boolean;
  source?: RegistrySource;
  compatibilityLayer?: string;
  filters?: EngineFilters;
  input?: EngineInput;
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
  input: EngineInput;
  origin: EngineOrigin;
}

export const inputOf = (entry: AnyEngineEntry): EngineInput =>
  ("input" in entry ? entry.input : undefined) ?? ENGINE_INPUT.TEXT;

export const manifestOf = (
  entry: AnyEngineEntry,
): PluginManifest | undefined => entry.instance.pluginManifest;

export const manifestKeys = (entry: AnyEngineEntry): Set<string> =>
  new Set(
    (manifestOf(entry)?.settingsSchema ?? []).map((f: SettingField) => f.key),
  );
