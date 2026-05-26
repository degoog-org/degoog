import {
  type EngineConfig,
  type ExtensionMeta,
  type SearchEngine,
  type SearchType,
  type SettingField,
  type Translate,
  ExtensionStoreType,
} from "../../types";
import {
  asString,
  getSettings,
  getTypeOverride,
  isDisabled,
  maskSecrets,
  mergeDefaults,
} from "../../utils/plugin-settings";
import { bootCircuitFromPath } from "../../utils/translation-circuit";
import {
  getTransportNames,
  getTransportDisplayNames,
} from "../transports/registry";
import { enginesDir, defaultEnginesFile } from "../../utils/paths";
import { readFileSync } from "fs";
import { createRegistry } from "../registry-factory";
import { extensionReadmeExists } from "../../utils/extension-docs";

export type EngineSearchType =
  | "web"
  | "images"
  | "videos"
  | "news"
  | (string & {});

export const ENGINE_IDS = [] as readonly string[];
export type EngineId = string;

interface PluginEntry {
  id: string;
  displayName: string;
  searchType: EngineSearchType;
  description?: string;
  instance: SearchEngine;
  disabledByDefault?: boolean;
}

const isSearchEngine = (val: unknown): val is SearchEngine => {
  return (
    typeof val === "object" &&
    val !== null &&
    "name" in val &&
    typeof (val as SearchEngine).name === "string" &&
    "executeSearch" in val &&
    typeof (val as SearchEngine).executeSearch === "function"
  );
};

const engineRegistry = createRegistry<PluginEntry>({
  dirs: () => [{ dir: enginesDir() }],
  canonicalIdKind: "engine",
  match: (mod) => {
    const Export = mod.default ?? mod.engine ?? mod.Engine;
    const instance: SearchEngine =
      typeof Export === "function"
        ? new (Export as new () => SearchEngine)()
        : (Export as SearchEngine);
    if (!isSearchEngine(instance)) return null;
    return {
      id: "",
      displayName: instance.name,
      searchType:
        typeof mod.type === "string" && (mod.type as string).trim()
          ? (mod.type as string)
          : "web",
      description:
        typeof mod.description === "string" ? mod.description : undefined,
      instance,
    };
  },
  onLoad: async (entry, { entryPath, canonicalId, folderName }) => {
    entry.id = canonicalId ?? `${folderName}-engine`;
    entry.instance.t = await bootCircuitFromPath(entryPath);
    if (entry.instance.configure && entry.instance.settingsSchema?.length) {
      const stored = await getSettings(entry.id);
      entry.instance.configure(
        mergeDefaults(stored, entry.instance.settingsSchema),
      );
    }
  },
  allowFlatFiles: true,
  debugTag: "engines",
});

export const getEngineRegistry = (): {
  id: string;
  displayName: string;
  disabledByDefault?: boolean;
  searchType?: EngineSearchType;
}[] =>
  engineRegistry.items().map((e) => ({
    id: e.id,
    displayName: e.displayName,
    disabledByDefault: e.disabledByDefault,
    searchType: e.searchType,
  }));

export const getEffectiveEngineRegistry = async (): Promise<
  {
    id: string;
    displayName: string;
    disabledByDefault?: boolean;
    searchType?: EngineSearchType;
  }[]
> => {
  return Promise.all(
    engineRegistry.items().map(async (e) => ({
      id: e.id,
      displayName: e.displayName,
      disabledByDefault: e.disabledByDefault,
      searchType: ((await getTypeOverride(e.id)) ??
        e.searchType) as EngineSearchType,
    })),
  );
};

export const getEngineMap = (): Record<string, SearchEngine> =>
  Object.fromEntries(engineRegistry.items().map((e) => [e.id, e.instance]));

export const getEnginesForCustomType = async (
  engineType: string,
): Promise<{ id: string; instance: SearchEngine }[]> => {
  const results: { id: string; instance: SearchEngine }[] = [];
  for (const e of engineRegistry.items()) {
    if (await isDisabled(e.id)) continue;
    const effectiveType = (await getTypeOverride(e.id)) ?? e.searchType;
    if (effectiveType === engineType)
      results.push({ id: e.id, instance: e.instance });
  }
  return results;
};

const BUILTIN_TYPES = new Set(["web", "news", "images", "videos"]);

export const getCustomEngineTypes = async (): Promise<string[]> => {
  const types = new Set<string>();
  for (const e of engineRegistry.items()) {
    if (await isDisabled(e.id)) continue;
    const effectiveType = (await getTypeOverride(e.id)) ?? e.searchType;
    if (!BUILTIN_TYPES.has(effectiveType)) types.add(effectiveType);
  }
  return [...types];
};

export const getEngineSearchType = async (
  engineId: string,
): Promise<string | null> => {
  const plugin = engineRegistry.items().find((e) => e.id === engineId);
  if (!plugin) return null;
  return (await getTypeOverride(engineId)) ?? plugin.searchType;
};

const engineRequiresConfig = (engine: SearchEngine): boolean => {
  const schema = engine.settingsSchema ?? [];
  return schema.some((f) => f.required === true);
};

const hasRequiredConfig = async (
  engineId: string,
  instance: SearchEngine,
): Promise<boolean> => {
  const schema = instance.settingsSchema ?? [];
  const requiredKeys = schema.filter((f) => f.required).map((f) => f.key);
  if (requiredKeys.length === 0) return true;
  const stored = await getSettings(engineId);
  return requiredKeys.every((k) => {
    const v = stored[k];
    if (Array.isArray(v)) return v.length > 0;
    return typeof v === "string" && v.trim() !== "";
  });
};

export const getEnginesForSearchType = async (
  type: SearchType,
  config: EngineConfig,
): Promise<{ id: string; instance: SearchEngine }[]> => {
  if (!type) return [];

  const active: { id: string; instance: SearchEngine }[] = [];
  for (const e of engineRegistry.items()) {
    if (!config[e.id]) continue;
    const typeOverride = (await getTypeOverride(e.id)) ?? e.searchType;
    if (typeOverride === type) {
      active.push({ id: e.id, instance: e.instance });
    }
  }
  return active;
};

export const getActiveWebEngines = async (
  config: EngineConfig,
): Promise<{ id: string; instance: SearchEngine; score: number }[]> => {
  const active: { id: string; instance: SearchEngine; score: number }[] = [];
  for (const e of engineRegistry.items()) {
    if (!config[e.id]) continue;
    const effectiveType = (await getTypeOverride(e.id)) ?? e.searchType;
    if (effectiveType !== "web") continue;
    if (
      engineRequiresConfig(e.instance) &&
      !(await hasRequiredConfig(e.id, e.instance))
    )
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
    return {};
  }
};

export const getDefaultEngineConfig = (): Record<string, boolean> => {
  const entries = getEngineRegistry();
  const engineMap = getEngineMap();
  const overrides = _loadDefaultEngineOverrides();
  return Object.fromEntries(
    entries.map((e) => {
      if (e.id in overrides) return [e.id, overrides[e.id]];
      const instance = engineMap[e.id];
      const disabledByDefault =
        instance &&
        (engineRequiresConfig(instance) || e.disabledByDefault === true);
      return [e.id, !disabledByDefault];
    }),
  );
};

const SCORE_FIELD: SettingField = {
  key: "score",
  label: "Score",
  type: "number",
  default: "1",
  description:
    "Result ranking multiplier for this engine. Higher values favour its results.",
  advanced: true,
};

const OUTGOING_TRANSPORT_FIELD: SettingField = {
  key: "outgoingTransport",
  label: "Outgoing HTTP client transport",
  type: "select",
  options: ["fetch", "curl", "curl-fallback"],
  default: "fetch",
  description: "The outgoing HTTP client to use for this engine.",
  advanced: true,
};

const CUSTOM_USER_AGENTS_FIELD: SettingField = {
  key: "customUserAgents",
  label: "Custom user agents",
  type: "textarea",
  default: "",
  description:
    "One user agent per line. A random one will be used per request for this engine.",
  advanced: true,
};

const PROXY_OVERRIDE_ENABLED_FIELD: SettingField = {
  key: "proxyOverrideEnabled",
  label: "Override proxies",
  type: "toggle",
  default: "false",
  description:
    "When enabled, this engine uses its own proxy list and ignores global proxy settings.",
  advanced: true,
};

const PROXY_OVERRIDE_URLS_FIELD: SettingField = {
  key: "proxyOverrideUrls",
  label: "Proxy override list",
  type: "textarea",
  default: "",
  description:
    "One proxy URL per line. Used only when override is enabled for this engine.",
  advanced: true,
  visibleWhen: { key: "proxyOverrideEnabled", equals: "true" },
};

export const getEngineIdByInstance = (
  instance: SearchEngine,
): string | undefined => {
  for (const e of engineRegistry.items()) {
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

export const getEngineExtensionMeta = async (
  coreT?: Translate,
): Promise<ExtensionMeta[]> => {
  const items = engineRegistry.items();
  const engineMap = getEngineMap();
  const results: ExtensionMeta[] = [];
  const transportOptions = getTransportNames();
  const transportLabels = getTransportDisplayNames();

  const baseScoreField = coreT
    ? {
        ...SCORE_FIELD,
        label: coreT("settings-page.schema.score.label") || SCORE_FIELD.label,
        description:
          coreT("settings-page.schema.score.description") ||
          SCORE_FIELD.description,
      }
    : SCORE_FIELD;

  const baseTransportField = coreT
    ? {
        ...OUTGOING_TRANSPORT_FIELD,
        label:
          coreT("settings-page.schema.outgoing-transport.label") ||
          OUTGOING_TRANSPORT_FIELD.label,
        description:
          coreT("settings-page.schema.outgoing-transport.description") ||
          OUTGOING_TRANSPORT_FIELD.description,
      }
    : OUTGOING_TRANSPORT_FIELD;

  const defaults = getDefaultEngineConfig();
  for (const entry of items) {
    const instance = engineMap[entry.id];
    const engineSchema = instance?.settingsSchema ?? [];

    const engineTransportField = engineSchema.find(
      (f) => f.key === "outgoingTransport",
    );
    const engineScoreField = engineSchema.find((f) => f.key === "score");

    const transportDefault =
      engineTransportField?.default ?? OUTGOING_TRANSPORT_FIELD.default;

    const transportField: SettingField = {
      ...baseTransportField,
      options: transportOptions,
      optionLabels: transportLabels,
      default: transportDefault,
    };

    const scoreField: SettingField = engineScoreField
      ? {
          ...baseScoreField,
          default: engineScoreField.default ?? baseScoreField.default,
        }
      : baseScoreField;

    const pluginT = entry.instance.t;
    const engineSchemaFiltered = engineSchema.filter(
      (f) => f.key !== "outgoingTransport" && f.key !== "score",
    );
    const translatedEngineSchema = pluginT
      ? engineSchemaFiltered.map((field) => {
          const base = `${entry.id}.settings.${field.key}`;
          const label = pluginT(`${base}.label`);
          const desc =
            field.description !== undefined
              ? pluginT(`${base}.description`)
              : undefined;
          const placeholder =
            field.placeholder !== undefined
              ? pluginT(`${base}.placeholder`)
              : undefined;
          return {
            ...field,
            label: label !== `${base}.label` ? label : field.label,
            ...(desc !== undefined && desc !== `${base}.description`
              ? { description: desc }
              : {}),
            ...(placeholder !== undefined &&
            placeholder !== `${base}.placeholder`
              ? { placeholder }
              : {}),
          };
        })
      : engineSchemaFiltered;

    const effectiveType = (await getTypeOverride(entry.id)) ?? entry.searchType;

    const typeOverrideField: SettingField = {
      key: "searchTypeOverride",
      label: "Engine type",
      type: "text",
      default: entry.searchType,
      description:
        "Override the tab this engine belongs to. Leave blank to use the default.",
      advanced: true,
      placeholder: entry.searchType,
    };

    const schema: SettingField[] = [
      scoreField,
      transportField,
      CUSTOM_USER_AGENTS_FIELD,
      PROXY_OVERRIDE_ENABLED_FIELD,
      PROXY_OVERRIDE_URLS_FIELD,
      typeOverrideField,
      ...translatedEngineSchema,
    ];
    const rawSettings = await getSettings(entry.id);
    const maskedSettings = maskSecrets(rawSettings, schema);
    const { exists } = await extensionReadmeExists(entry.id);

    results.push({
      id: entry.id,
      displayName: entry.displayName,
      description: entry.description ?? "",
      searchType: effectiveType,
      type: ExtensionStoreType.Engine,
      configurable: true,
      settingsSchema: schema,
      settings: maskedSettings,
      extensionDocsAvailable: exists,
      defaultEnabled: defaults[entry.id],
    });
  }

  return results;
};

export const initEngines = async (): Promise<void> => {
  await engineRegistry.init();
};

export const reloadEngines = async (): Promise<void> => {
  await initEngines();
};

export const getAllEngineTranslators = (): {
  namespace: string;
  translator: Translate;
}[] =>
  engineRegistry
    .items()
    .filter((e) => !!e.instance.t)
    .map((e) => ({ namespace: `engines/${e.id}`, translator: e.instance.t! }));
