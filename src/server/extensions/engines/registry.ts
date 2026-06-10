import {
  type EngineConfig,
  type ExtensionMeta,
  type SearchEngine,
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
  asBoolean,
  mergeDefaults,
} from "../../utils/plugin-settings";
import { bootCircuitFromPath } from "../../utils/translation-circuit";
import {
  getTransportNames,
  getTransportDisplayNames,
} from "../transports/registry";
import { enginesDir, defaultEnginesFile } from "../../utils/paths";
import { readFileSync } from "fs";
import { join } from "path";
import { createRegistry, type RegistrySource } from "../registry-factory";
import { extensionReadmeExists } from "../../utils/extension-docs";
import { logger } from "../../utils/logger";
import { getInstanceSettings } from "../../utils/server-settings";
import { DEGOOG_ENGINE_ID } from "./builtins/degoog";

const builtinsDir = join(import.meta.dir, "builtins");

const TYPE_CACHE_TTL_MS = 60_000;
const _typeCache = new Map<string, { types: string[]; at: number }>();

export const clearTypeCache = (): void => {
  _typeCache.clear();
};

export type EngineSearchType = string;

export const ENGINE_IDS = [] as readonly string[];
export type EngineId = string;

export interface EngineCatalogEntry {
  id: string;
  displayName: string;
  disabledByDefault?: boolean;
  searchTypes: EngineSearchType[];
  primaryType: EngineSearchType;
}

interface PluginEntry {
  id: string;
  displayName: string;
  searchTypes: string[];
  description?: string;
  instance: SearchEngine;
  disabledByDefault?: boolean;
  source?: RegistrySource;
}

const resolveTypes = (
  baseTypes: string[],
  override: string | null,
): string[] => {
  if (override)
    return override
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  return baseTypes;
};

export const primaryType = (types: string[]): string =>
  types.length > 0 ? types[0] : "web";

const isEngineEnabled = (
  id: string,
  config: EngineConfig,
  indexerOn: boolean,
): boolean => {
  if (id === DEGOOG_ENGINE_ID && !indexerOn) return false;
  if (id in config) return !!config[id];
  return indexerOn && id === DEGOOG_ENGINE_ID;
};

export const resolveTabSearchType = (
  types: string[],
  preferred?: string,
): string => {
  const normalized = preferred?.trim().toLowerCase();
  if (normalized && types.some((t) => t.toLowerCase() === normalized)) {
    return types.find((t) => t.toLowerCase() === normalized) ?? normalized;
  }
  return primaryType(types);
};

type TypeFn = () => string[] | Promise<string[]>;

const _coerceTypeList = (raw: unknown): string[] => {
  if (Array.isArray(raw)) {
    return raw.filter(
      (t): t is string => typeof t === "string" && t.trim() !== "",
    );
  }
  if (typeof raw === "string" && raw.trim()) return [raw];
  return [];
};

const _resolving = new Set<string>();

const resolveEngineTypes = async (entry: PluginEntry): Promise<string[]> => {
  const cached = _typeCache.get(entry.id);
  if (cached && Date.now() - cached.at < TYPE_CACHE_TTL_MS) return cached.types;
  const types = await computeEngineTypes(entry);
  _typeCache.set(entry.id, { types, at: Date.now() });
  return types;
};

const computeEngineTypes = async (entry: PluginEntry): Promise<string[]> => {
  const override = await getTypeOverride(entry.id);
  const dyn = (entry.instance as SearchEngine & { __typeFn?: TypeFn }).__typeFn;

  if (dyn && !_resolving.has(entry.id)) {
    _resolving.add(entry.id);
    try {
      const result = await dyn();
      return resolveTypes(_coerceTypeList(result), override);
    } catch (err) {
      logger.warn("engines", `dynamic type() failed for ${entry.id}`, err);
    } finally {
      _resolving.delete(entry.id);
    }
  }

  const base = entry.searchTypes.length > 0 ? entry.searchTypes : ["web"];
  return resolveTypes(base, override);
};

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
  dirs: () => [{ dir: builtinsDir, source: "builtin" }, { dir: enginesDir() }],
  canonicalIdKind: "engine",
  match: (mod) => {
    const Export = mod.default ?? mod.engine ?? mod.Engine;
    let instance: SearchEngine | null = null;
    if (typeof Export === "function") {
      instance = new (Export as new () => SearchEngine)();
    } else if (Export && isSearchEngine(Export)) {
      instance = Export as SearchEngine;
    } else if (isSearchEngine(mod)) {
      instance = mod as SearchEngine;
    }
    if (!instance) return null;
    const isFn = typeof mod.type === "function";
    (instance as SearchEngine & { __typeFn?: TypeFn }).__typeFn = isFn
      ? (mod.type as TypeFn)
      : undefined;
    const declared = isFn ? [] : _coerceTypeList(mod.type);
    return {
      id: "",
      displayName: instance.name,
      searchTypes: declared.length > 0 ? declared : isFn ? [] : ["web"],
      description:
        typeof mod.description === "string" ? mod.description : undefined,
      instance,
    };
  },
  onLoad: async (entry, { entryPath, canonicalId, folderName, source }) => {
    entry.id = canonicalId ?? `${folderName}-engine`;
    entry.source = source;
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

export const listEngineIds = (): string[] =>
  engineRegistry.items().map((e) => e.id);

export const listEngines = async (): Promise<EngineCatalogEntry[]> =>
  Promise.all(
    engineRegistry.items().map(async (e) => {
      const searchTypes = await resolveEngineTypes(e);
      return {
        id: e.id,
        displayName: e.displayName,
        disabledByDefault: e.disabledByDefault,
        searchTypes,
        primaryType: primaryType(searchTypes),
      };
    }),
  );

export const getEngineMap = (): Record<string, SearchEngine> =>
  Object.fromEntries(engineRegistry.items().map((e) => [e.id, e.instance]));

export const getEnginesForCustomType = async (
  engineType: string,
  config?: EngineConfig,
): Promise<{ id: string; instance: SearchEngine }[]> => {
  const results: { id: string; instance: SearchEngine }[] = [];
  const settings = await getInstanceSettings();
  const indexerOn = asBoolean(settings.degoogIndexerEnabled);
  for (const e of engineRegistry.items()) {
    const enabled = !config || isEngineEnabled(e.id, config, indexerOn);
    if (!enabled) continue;
    if (await isDisabled(e.id)) continue;
    const types = await resolveEngineTypes(e);
    if (types.includes(engineType))
      results.push({ id: e.id, instance: e.instance });
  }
  return results;
};

export const getCustomEngineTypes = async (): Promise<string[]> => {
  const types = new Set<string>();
  for (const e of engineRegistry.items()) {
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
  for (const e of engineRegistry.items()) {
    if (excludeId && e.id === excludeId) continue;
    for (const t of await resolveEngineTypes(e)) types.add(t);
  }
  return [...types];
};

export const getEngineSearchType = async (
  engineId: string,
  preferredTab?: string,
): Promise<string | null> => {
  const plugin = engineRegistry.items().find((e) => e.id === engineId);
  if (!plugin) return null;
  const types = await resolveEngineTypes(plugin);
  return resolveTabSearchType(types, preferredTab);
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

export const getActiveWebEngines = async (
  config: EngineConfig,
): Promise<{ id: string; instance: SearchEngine; score: number }[]> => {
  const settings = await getInstanceSettings();
  const indexerOn = asBoolean(settings.degoogIndexerEnabled);
  const active: { id: string; instance: SearchEngine; score: number }[] = [];
  for (const e of engineRegistry.items()) {
    const enabled = isEngineEnabled(e.id, config, indexerOn);
    if (!enabled) continue;
    const types = await resolveEngineTypes(e);
    if (!types.includes("web")) continue;
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
    engineRegistry.items().map((e) => {
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

  const settings = await getInstanceSettings();
  const indexerOn = asBoolean(settings.degoogIndexerEnabled);

  const defaults = getDefaultEngineConfig();
  for (const entry of items) {
    if (entry.id === DEGOOG_ENGINE_ID && !indexerOn) continue;
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
      (f) =>
        f.key !== "outgoingTransport" &&
        f.key !== "score" &&
        f.key !== "searchTypeOverride",
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

    const override = await getTypeOverride(entry.id);
    const effectiveTypes = resolveTypes(entry.searchTypes, override);
    const typesDisplay = entry.searchTypes.join(",");
    const typeOverrideField: SettingField = {
      key: "searchTypeOverride",
      label: "Engine type override",
      type: "text",
      default: typesDisplay,
      description:
        "Override which tabs this engine runs in. Use a single type (e.g. images) or comma-separated for multiple (e.g. web,keywords). Leave blank to use the default.",
      advanced: true,
      placeholder: typesDisplay,
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
      primaryType: primaryType(effectiveTypes),
      searchTypes: effectiveTypes,
      type: ExtensionStoreType.Engine,
      configurable: true,
      settingsSchema: schema,
      settings: maskedSettings,
      extensionDocsAvailable: exists,
      defaultEnabled: defaults[entry.id],
      source: entry.source,
    });
  }

  return results;
};

export const initEngines = async (bust = false): Promise<void> => {
  clearTypeCache();
  await (bust ? engineRegistry.reload() : engineRegistry.init());
};

export const reloadEngines = async (bust = true): Promise<void> => {
  await initEngines(bust);
};

export const getAllEngineTranslators = (): {
  namespace: string;
  translator: Translate;
}[] =>
  engineRegistry
    .items()
    .filter((e) => !!e.instance.t)
    .map((e) => ({ namespace: `engines/${e.id}`, translator: e.instance.t! }));
