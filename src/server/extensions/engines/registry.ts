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
  maskSecrets,
  mergeDefaults,
} from "../../utils/plugin-settings";
import { createTranslatorFromPath } from "../../utils/translation";
import { getTransportNames } from "../transports/registry";
import { enginesDir, defaultEnginesFile } from "../../utils/paths";
import { readFileSync } from "fs";
import { createRegistry } from "../registry-factory";
import { BingEngine } from "./bing";
import { BingImagesEngine } from "./bing-images";
import { BingNewsEngine } from "./bing-news";
import { BingVideosEngine } from "./bing-videos";
import { BraveEngine } from "./brave";
import { BraveNewsEngine } from "./brave-news";
import { DuckDuckGoEngine } from "./duckduckgo";
import { GoogleEngine } from "./google";
import { GoogleImagesEngine } from "./google-images";
import { GoogleVideosEngine } from "./google-videos";
import { RedditEngine } from "./reddit";
import { WikipediaEngine } from "./wikipedia";

export type EngineSearchType =
  | "web"
  | "images"
  | "videos"
  | "news"
  | (string & {});

export interface EngineDefinition {
  id: string;
  displayName: string;
  searchType: EngineSearchType;
  EngineClass: new () => SearchEngine;
  disabledByDefault?: boolean;
  outgoingHosts?: string[];
  defaultTransport?: string;
}

const BUILTIN_DEFINITIONS: EngineDefinition[] = [
  {
    id: "google",
    displayName: "Google",
    searchType: "web",
    EngineClass: GoogleEngine,
    outgoingHosts: ["www.google.com", "google.com"],
    defaultTransport: "curl",
  },
  {
    id: "duckduckgo",
    displayName: "DuckDuckGo",
    searchType: "web",
    EngineClass: DuckDuckGoEngine,
    outgoingHosts: ["html.duckduckgo.com", "duckduckgo.com"],
  },
  {
    id: "bing",
    displayName: "Bing",
    searchType: "web",
    EngineClass: BingEngine,
    disabledByDefault: true,
    outgoingHosts: ["www.bing.com", "bing.com"],
  },
  {
    id: "brave",
    displayName: "Brave Search",
    searchType: "web",
    EngineClass: BraveEngine,
    outgoingHosts: ["search.brave.com"],
  },
  {
    id: "wikipedia",
    displayName: "Wikipedia",
    searchType: "web",
    EngineClass: WikipediaEngine,
    outgoingHosts: ["en.wikipedia.org", "www.wikipedia.org", "wikipedia.org"],
  },
  {
    id: "reddit",
    displayName: "Reddit",
    searchType: "web",
    EngineClass: RedditEngine,
    outgoingHosts: ["www.reddit.com", "reddit.com"],
  },
  {
    id: "google-images",
    displayName: "Google Images",
    searchType: "images",
    EngineClass: GoogleImagesEngine,
    outgoingHosts: ["www.google.com", "google.com"],
  },
  {
    id: "bing-images",
    displayName: "Bing Images",
    searchType: "images",
    EngineClass: BingImagesEngine,
    outgoingHosts: ["www.bing.com", "bing.com"],
  },
  {
    id: "google-videos",
    displayName: "Google Videos",
    searchType: "videos",
    EngineClass: GoogleVideosEngine,
    outgoingHosts: ["www.google.com", "google.com", "i.ytimg.com"],
  },
  {
    id: "bing-videos",
    displayName: "Bing Videos",
    searchType: "videos",
    EngineClass: BingVideosEngine,
    outgoingHosts: ["www.bing.com", "bing.com"],
  },
  {
    id: "brave-news",
    displayName: "Brave News",
    searchType: "news",
    EngineClass: BraveNewsEngine,
    outgoingHosts: ["search.brave.com"],
  },
  {
    id: "bing-news",
    displayName: "Bing News",
    searchType: "news",
    EngineClass: BingNewsEngine,
    outgoingHosts: ["www.bing.com", "bing.com"],
  },
];

const webIds = BUILTIN_DEFINITIONS.filter((d) => d.searchType === "web").map(
  (d) => d.id,
);
export const ENGINE_IDS = webIds as readonly string[];
export type EngineId = (typeof ENGINE_IDS)[number];

const builtinMap = Object.fromEntries(
  BUILTIN_DEFINITIONS.map((d) => [d.id, new d.EngineClass()]),
) as Record<string, SearchEngine>;

const builtinRegistry = BUILTIN_DEFINITIONS.map((d) => ({
  id: d.id,
  displayName: d.displayName,
  disabledByDefault: d.disabledByDefault,
  searchType: d.searchType,
}));

interface PluginEntry {
  id: string;
  displayName: string;
  searchType: EngineSearchType;
  instance: SearchEngine;
  disabledByDefault?: boolean;
  outgoingHosts?: string[];
}

function isSearchEngine(val: unknown): val is SearchEngine {
  return (
    typeof val === "object" &&
    val !== null &&
    "name" in val &&
    typeof (val as SearchEngine).name === "string" &&
    "executeSearch" in val &&
    typeof (val as SearchEngine).executeSearch === "function"
  );
}

const engineRegistry = createRegistry<PluginEntry>({
  dirs: () => [{ dir: enginesDir(), source: "plugin" }],
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
      instance,
      outgoingHosts:
        Array.isArray(mod.outgoingHosts) &&
        (mod.outgoingHosts as unknown[]).length > 0
          ? (mod.outgoingHosts as string[])
          : undefined,
    };
  },
  onLoad: async (entry, { entryPath, folderName }) => {
    entry.id = `engine-${folderName}`;
    entry.instance.t = await createTranslatorFromPath(entryPath);
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

export function getEngineRegistry(): {
  id: string;
  displayName: string;
  disabledByDefault?: boolean;
  searchType?: EngineSearchType;
}[] {
  return [
    ...builtinRegistry,
    ...engineRegistry.items().map((e) => ({
      id: e.id,
      displayName: e.displayName,
      disabledByDefault: e.disabledByDefault,
      searchType: e.searchType,
    })),
  ];
}

export function getOutgoingAllowlist(): string[] {
  const fromBuiltins = BUILTIN_DEFINITIONS.flatMap(
    (d) => d.outgoingHosts ?? [],
  );
  const fromPlugins = engineRegistry.items().flatMap((e) => e.outgoingHosts ?? []);
  const all = [...fromBuiltins, ...fromPlugins];
  return [...new Set(all)];
}

export function getEngineMap(): Record<string, SearchEngine> {
  const pluginMap = Object.fromEntries(
    engineRegistry.items().map((e) => [e.id, e.instance]),
  );
  return { ...builtinMap, ...pluginMap };
}

function engineSearchTypeFromSearchType(
  type: SearchType,
): EngineSearchType | null {
  if (type === "web") return "web";
  if (type === "images" || type === "videos" || type === "news") return type;
  return null;
}

export function getEnginesForCustomType(
  engineType: string,
): { id: string; instance: SearchEngine }[] {
  return engineRegistry.items()
    .filter((e) => e.searchType === engineType)
    .map((e) => ({ id: e.id, instance: e.instance }));
}

const BUILTIN_TYPES = new Set(["web", "news", "images", "videos"]);

export function getCustomEngineTypes(): string[] {
  const types = new Set<string>();
  for (const e of engineRegistry.items()) {
    if (!BUILTIN_TYPES.has(e.searchType)) types.add(e.searchType);
  }
  return [...types];
}

function engineRequiresConfig(engine: SearchEngine): boolean {
  const schema = engine.settingsSchema ?? [];
  return schema.some((f) => f.required === true);
}

async function hasRequiredConfig(
  engineId: string,
  instance: SearchEngine,
): Promise<boolean> {
  const schema = instance.settingsSchema ?? [];
  const requiredKeys = schema.filter((f) => f.required).map((f) => f.key);
  if (requiredKeys.length === 0) return true;
  const stored = await getSettings(engineId);
  return requiredKeys.every((k) => {
    const v = stored[k];
    if (Array.isArray(v)) return v.length > 0;
    return typeof v === "string" && v.trim() !== "";
  });
}

export function getEnginesForSearchType(
  type: SearchType,
  config: EngineConfig,
): { id: string; instance: SearchEngine }[] {
  const engineType = engineSearchTypeFromSearchType(type);
  if (!engineType) return [];

  const allDefinitions = [
    ...BUILTIN_DEFINITIONS.filter((d) => d.searchType === engineType),
    ...engineRegistry.items().filter((e) => e.searchType === engineType),
  ];
  const engineMap = getEngineMap();

  const active: { id: string; instance: SearchEngine }[] = [];
  for (const def of allDefinitions) {
    if (config[def.id]) {
      const instance = engineMap[def.id];
      if (instance) active.push({ id: def.id, instance });
    }
  }
  return active;
}

export const getActiveWebEngines = async (
  config: EngineConfig,
): Promise<{ id: string; instance: SearchEngine; score: number }[]> => {
  const allDefinitions = [
    ...BUILTIN_DEFINITIONS.filter((d) => d.searchType === "web"),
    ...engineRegistry.items().filter((e) => e.searchType === "web"),
  ];
  const engineMap = getEngineMap();
  const active: { id: string; instance: SearchEngine; score: number }[] = [];
  for (const def of allDefinitions) {
    if (!config[def.id]) continue;
    const instance = engineMap[def.id];
    if (!instance) continue;
    if (
      engineRequiresConfig(instance) &&
      !(await hasRequiredConfig(def.id, instance))
    )
      continue;
    const stored = await getSettings(def.id);
    const score = Math.max(parseFloat(asString(stored["score"])) || 1, 0.1);
    active.push({ id: def.id, instance, score });
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

export function getDefaultEngineConfig(): Record<string, boolean> {
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
}

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
  description:
    "The outgoing HTTP client to use for this engine. Select 'auto' to use the best available client based on your system configuration.",
  advanced: true,
};

export function getEngineIdByInstance(
  instance: SearchEngine,
): string | undefined {
  for (const d of BUILTIN_DEFINITIONS) {
    if (builtinMap[d.id] === instance) return d.id;
  }
  for (const e of engineRegistry.items()) {
    if (e.instance === instance) return e.id;
  }
  return undefined;
}

export const getEngineDefaultTransport = (
  engineId: string,
): string | undefined => {
  const builtinDef = BUILTIN_DEFINITIONS.find((d) => d.id === engineId);
  if (builtinDef?.defaultTransport) return builtinDef.defaultTransport;
  const instance = getEngineMap()[engineId];
  const field = instance?.settingsSchema?.find(
    (f) => f.key === "outgoingTransport",
  );
  return field?.default ?? undefined;
};

export async function getEngineExtensionMeta(
  coreT?: Translate,
): Promise<ExtensionMeta[]> {
  const pluginItems = engineRegistry.items();
  const allDefs = [
    ...BUILTIN_DEFINITIONS,
    ...pluginItems.map((e) => ({
      id: e.id,
      displayName: e.displayName,
      searchType: e.searchType,
      instance: e.instance,
    })),
  ];

  const engineMap = getEngineMap();
  const results: ExtensionMeta[] = [];
  const transportOptions = getTransportNames();

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
  for (const def of allDefs) {
    const instance = engineMap[def.id];
    const engineSchema = instance?.settingsSchema ?? [];

    const engineTransportField = engineSchema.find(
      (f) => f.key === "outgoingTransport",
    );
    const engineScoreField = engineSchema.find((f) => f.key === "score");
    const builtinDef = BUILTIN_DEFINITIONS.find((d) => d.id === def.id);

    const transportDefault =
      engineTransportField?.default ??
      builtinDef?.defaultTransport ??
      OUTGOING_TRANSPORT_FIELD.default;

    const transportField: SettingField = {
      ...baseTransportField,
      options: transportOptions,
      default: transportDefault,
    };

    const scoreField: SettingField = engineScoreField
      ? {
          ...baseScoreField,
          default: engineScoreField.default ?? baseScoreField.default,
        }
      : baseScoreField;

    const pluginEntry = pluginItems.find((e) => e.id === def.id);
    const pluginT = pluginEntry?.instance.t;

    const engineSchemaFiltered = engineSchema.filter(
      (f) => f.key !== "outgoingTransport" && f.key !== "score",
    );
    const translatedEngineSchema = pluginT
      ? engineSchemaFiltered.map((field) => {
          const base = `${def.id}.settings.${field.key}`;
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

    const schema: SettingField[] = [
      scoreField,
      transportField,
      ...translatedEngineSchema,
    ];
    const rawSettings = await getSettings(def.id);
    const maskedSettings = maskSecrets(rawSettings, schema);

    results.push({
      id: def.id,
      displayName: def.displayName,
      description: `${def.searchType} search engine`,
      type: ExtensionStoreType.Engine,
      configurable: true,
      settingsSchema: schema,
      settings: maskedSettings,
      defaultEnabled: defaults[def.id],
    });
  }

  return results;
}

export async function initEngines(): Promise<void> {
  for (const def of BUILTIN_DEFINITIONS) {
    const instance = builtinMap[def.id];
    if (instance?.configure && instance.settingsSchema?.length) {
      const stored = await getSettings(def.id);
      instance.configure(mergeDefaults(stored, instance.settingsSchema));
    }
  }

  await engineRegistry.init();
}

export async function reloadEngines(): Promise<void> {
  await initEngines();
}

export function setEnginesLocale(locale: string): void {
  for (const entry of engineRegistry.items()) {
    entry.instance.t?.setLocale(locale);
  }
}

export function getAllEngineTranslators(): {
  namespace: string;
  translator: Translate;
}[] {
  return engineRegistry.items()
    .filter((e) => !!e.instance.t)
    .map((e) => ({ namespace: `engines/${e.id}`, translator: e.instance.t! }));
}
