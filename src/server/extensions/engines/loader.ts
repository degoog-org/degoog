import type { SearchEngine, Translate } from "../../types/extension";
import { isPluginManifest } from "../plugin-manifest";
import { bootCircuitFromPath } from "../../utils/extension-support/translation-circuit";
import { enginesDir } from "../../utils/paths";
import { join } from "path";
import { createRegistry } from "../registry-factory";
import { logger } from "../../utils/logger";
import {
  loadCompatEngines,
  type CompatEntry,
} from "../compatibility-layer/registry";
import { primeEngineHosts } from "./engine-hosts";
import { manifestOf, type AnyEngineEntry, type PluginEntry } from "./entries";
import { configureEngine } from "./engine-settings";
import {
  clearTypeCache,
  coerceFilters,
  coerceTypeList,
  type TypeFn,
} from "./search-types";

const builtinsDir = join(import.meta.dir, "builtins");

const _manifestClaims = new Map<string, string>();

const trackManifestId = (entry: PluginEntry): void => {
  const manifest = manifestOf(entry);
  if (!manifest) return;
  const claimed = _manifestClaims.get(manifest.id);
  if (claimed && claimed !== entry.id) {
    logger.warn(
      "engines",
      `manifest id ${manifest.id} is claimed by both ${claimed} and ${entry.id}`,
    );
  }
  _manifestClaims.set(manifest.id, entry.id);
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
    const declared = isFn ? [] : coerceTypeList(mod.type);
    if (isPluginManifest(mod.plugin)) instance.pluginManifest = mod.plugin;
    return {
      id: "",
      displayName: instance.name,
      pluginManifest: instance.pluginManifest,
      searchTypes: declared.length > 0 ? declared : isFn ? [] : ["web"],
      description:
        typeof mod.description === "string" ? mod.description : undefined,
      site: typeof mod.site === "string" ? mod.site : undefined,
      filters: coerceFilters(mod.filters),
      instance,
    };
  },
  onLoad: async (entry, { entryPath, canonicalId, folderName, source }) => {
    entry.id = canonicalId ?? `${folderName}-engine`;
    entry.source = source;
    entry.instance.t = await bootCircuitFromPath(entryPath);
    trackManifestId(entry);
    await configureEngine(entry);
  },
  allowFlatFiles: true,
  debugTag: "engines",
});

let _compatEntries: CompatEntry[] = [];

export const allEngineEntries = (): AnyEngineEntry[] => [
  ...engineRegistry.items(),
  ..._compatEntries,
];

export const listEngineIds = (): string[] =>
  allEngineEntries().map((e) => e.id);

export const initEngines = async (bust = false): Promise<void> => {
  clearTypeCache();
  _manifestClaims.clear();
  await primeEngineHosts();
  await (bust ? engineRegistry.reload() : engineRegistry.init());
  _compatEntries = await loadCompatEngines();
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
