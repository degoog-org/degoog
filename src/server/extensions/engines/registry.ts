import {
  type SearchEngine,
  type SearchType,
  type EngineConfig,
  type ExtensionMeta,
  type SettingField,
  ExtensionStoreType,
} from "../../types";
import {
  getSettings,
  maskSecrets,
  mergeDefaults,
  asString,
} from "../../utils/plugin-settings";
import { debug } from "../../utils/logger";
import { GoogleEngine } from "./google";
import { DuckDuckGoEngine } from "./duckduckgo";
import { BingEngine } from "./bing";
import { BraveEngine } from "./brave";
import { WikipediaEngine } from "./wikipedia";
import { RedditEngine } from "./reddit";
import { GoogleImagesEngine } from "./google-images";
import { BingImagesEngine } from "./bing-images";
import { GoogleVideosEngine } from "./google-videos";
import { BingVideosEngine } from "./bing-videos";
import { BraveNewsEngine } from "./brave-news";
import { BingNewsEngine } from "./bing-news";
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
}

const BUILTIN_DEFINITIONS: EngineDefinition[] = [
  {
    id: "google",
    displayName: "Google",
    searchType: "web",
    EngineClass: GoogleEngine,
    outgoingHosts: ["www.google.com", "google.com"],
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

let pluginEntries: PluginEntry[] = [];

export function getEngineRegistry(): {
  id: string;
  displayName: string;
  disabledByDefault?: boolean;
  searchType?: EngineSearchType;
}[] {
  return [
    ...builtinRegistry,
    ...pluginEntries.map((e) => ({
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
  const fromPlugins = pluginEntries.flatMap((e) => e.outgoingHosts ?? []);
  const all = [...fromBuiltins, ...fromPlugins];
  return [...new Set(all)];
}

export function getEngineMap(): Record<string, SearchEngine> {
  const pluginMap = Object.fromEntries(
    pluginEntries.map((e) => [e.id, e.instance]),
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
  return pluginEntries
    .filter((e) => e.searchType === engineType)
    .map((e) => ({ id: e.id, instance: e.instance }));
}

const BUILTIN_TYPES = new Set(["web", "news", "images", "videos"]);

export function getCustomEngineTypes(): string[] {
  const types = new Set<string>();
  for (const e of pluginEntries) {
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
    ...pluginEntries.filter((e) => e.searchType === engineType),
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
    ...pluginEntries.filter((e) => e.searchType === "web"),
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

export function getDefaultEngineConfig(): Record<string, boolean> {
  const entries = getEngineRegistry();
  const engineMap = getEngineMap();
  return Object.fromEntries(
    entries.map((e) => {
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
  label: "Outgoing HTTP client",
  type: "select",
  options: ["fetch", "curl", "auto"],
  default: "fetch",
  description:
    "fetch: runtime client | curl: system binary (different TLS) | auto: retry with curl on 403, 429, 502, or 503 | curl and auto need curl on the server PATH.",
  advanced: true,
};

export function getEngineIdByInstance(
  instance: SearchEngine,
): string | undefined {
  for (const d of BUILTIN_DEFINITIONS) {
    if (builtinMap[d.id] === instance) return d.id;
  }
  for (const e of pluginEntries) {
    if (e.instance === instance) return e.id;
  }
  return undefined;
}

export async function getEngineExtensionMeta(): Promise<ExtensionMeta[]> {
  const allDefs = [
    ...BUILTIN_DEFINITIONS,
    ...pluginEntries.map((e) => ({
      id: e.id,
      displayName: e.displayName,
      searchType: e.searchType,
      instance: e.instance,
    })),
  ];

  const engineMap = getEngineMap();
  const results: ExtensionMeta[] = [];

  const defaults = getDefaultEngineConfig();
  for (const def of allDefs) {
    const instance = engineMap[def.id];
    const engineSchema = instance?.settingsSchema ?? [];
    const engineSchemaFiltered = engineSchema.filter(
      (f) => f.key !== "outgoingTransport",
    );
    const schema: SettingField[] = [
      SCORE_FIELD,
      OUTGOING_TRANSPORT_FIELD,
      ...engineSchemaFiltered,
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

export async function initEngines(): Promise<void> {
  pluginEntries = [];
  for (const def of BUILTIN_DEFINITIONS) {
    const instance = builtinMap[def.id];
    if (instance?.configure && instance.settingsSchema?.length) {
      const stored = await getSettings(def.id);
      instance.configure(mergeDefaults(stored, instance.settingsSchema));
    }
  }

  const { readdir } = await import("fs/promises");
  const { join } = await import("path");
  const { pathToFileURL } = await import("url");
  const { enginesDir } = await import("../../utils/paths");
  const pluginDir = enginesDir();
  const seen = new Set<string>(BUILTIN_DEFINITIONS.map((d) => d.id));

  const { stat } = await import("fs/promises");
  try {
    const entries = await readdir(pluginDir, { withFileTypes: true });
    for (const entry of entries) {
      let fullPath: string;
      let base: string;
      if (entry.isFile() && /\.(js|ts|mjs|cjs)$/.test(entry.name)) {
        base = entry.name.replace(/\.(js|ts|mjs|cjs)$/, "");
        fullPath = join(pluginDir, entry.name);
      } else if (entry.isDirectory()) {
        let indexFile: string | undefined;
        for (const f of ["index.js", "index.ts", "index.mjs", "index.cjs"]) {
          try {
            const s = await stat(join(pluginDir, entry.name, f));
            if (s.isFile()) {
              indexFile = f;
              break;
            }
          } catch {
            //
          }
        }
        if (!indexFile) continue;
        base = entry.name;
        fullPath = join(pluginDir, entry.name, indexFile);
      } else {
        continue;
      }
      const id = `engine-${base}`;
      if (seen.has(id)) continue;
      seen.add(id);

      try {
        const url = pathToFileURL(fullPath).href;
        const mod = await import(url);
        const Export = mod.default ?? mod.engine ?? mod.Engine;
        const instance: SearchEngine =
          typeof Export === "function" ? new Export() : Export;
        if (!isSearchEngine(instance)) continue;
        const searchType =
          typeof mod.type === "string" && mod.type.trim() ? mod.type : "web";
        const pluginHosts =
          Array.isArray(mod.outgoingHosts) && mod.outgoingHosts.length > 0
            ? (mod.outgoingHosts as string[])
            : undefined;
        if (instance.configure && instance.settingsSchema?.length) {
          const stored = await getSettings(id);
          instance.configure(mergeDefaults(stored, instance.settingsSchema));
        }
        pluginEntries.push({
          id,
          displayName: instance.name,
          searchType,
          instance,
          outgoingHosts: pluginHosts,
        });
      } catch (err) {
        debug("engines", `Failed to load plugin engine: ${base}`, err);
      }
    }
  } catch (err) {
    debug("engines", `Failed to read engine plugin directory`, err);
  }
}

export async function reloadEngines(): Promise<void> {
  await initEngines();
}
