import {
  type AutocompleteProvider,
  type AutocompleteContext,
  type ExtensionMeta,
  ExtensionStoreType,
  type SettingField,
} from "../../types";
import {
  asString,
  getSettings,
  maskSecrets,
  mergeDefaults,
} from "../../utils/plugin-settings";
import { autocompleteDir } from "../../utils/paths";
import { outgoingFetch, parseOutgoingTransport } from "../../utils/outgoing";
import { autocompleteCache, createCache } from "../../utils/cache";
import { getTransportNames } from "../transports/registry";
import { createRegistry } from "../registry-factory";
import { logger } from "../../utils/logger";
import { GoogleAutocompleteProvider } from "./google";
import { DuckDuckGoAutocompleteProvider } from "./duckduckgo";

interface BuiltinDefinition {
  id: string;
  displayName: string;
  ProviderClass: new () => AutocompleteProvider;
  defaultTransport?: string;
}

const BUILTIN_DEFINITIONS: BuiltinDefinition[] = [
  {
    id: "autocomplete-builtin-google",
    displayName: "Google",
    ProviderClass: GoogleAutocompleteProvider,
  },
  {
    id: "autocomplete-builtin-duckduckgo",
    displayName: "DuckDuckGo",
    ProviderClass: DuckDuckGoAutocompleteProvider,
  },
];

const builtinMap = Object.fromEntries(
  BUILTIN_DEFINITIONS.map((d) => [d.id, new d.ProviderClass()]),
) as Record<string, AutocompleteProvider>;

interface PluginEntry {
  id: string;
  displayName: string;
  instance: AutocompleteProvider;
}

function isAutocompleteProvider(val: unknown): val is AutocompleteProvider {
  return (
    typeof val === "object" &&
    val !== null &&
    "name" in val &&
    typeof (val as AutocompleteProvider).name === "string" &&
    "getSuggestions" in val &&
    typeof (val as AutocompleteProvider).getSuggestions === "function"
  );
}

const pluginRegistry = createRegistry<PluginEntry>({
  dirs: () => [{ dir: autocompleteDir(), source: "plugin" }],
  match: (mod) => {
    const Export = mod.default ?? mod.provider ?? mod.Provider;
    const instance: AutocompleteProvider =
      typeof Export === "function"
        ? new (Export as new () => AutocompleteProvider)()
        : (Export as AutocompleteProvider);
    if (!isAutocompleteProvider(instance)) return null;
    return { id: "", displayName: instance.name, instance };
  },
  onLoad: async (entry, { folderName }) => {
    entry.id = `autocomplete-${folderName}`;
    const stored = await getSettings(entry.id);
    if (entry.instance.configure && entry.instance.settingsSchema?.length) {
      entry.instance.configure(
        mergeDefaults(stored, entry.instance.settingsSchema),
      );
    }
  },
  allowFlatFiles: true,
  debugTag: "autocomplete",
});

const OUTGOING_TRANSPORT_FIELD: SettingField = {
  key: "outgoingTransport",
  label: "Outgoing HTTP client",
  type: "select",
  options: ["fetch", "curl", "curl-fallback"],
  default: "fetch",
  description:
    "The outgoing HTTP client to use for this autocomplete provider.",
  advanced: true,
};

const SCORE_FIELD: SettingField = {
  key: "score",
  label: "Score",
  type: "number",
  default: "1",
  description:
    "Priority multiplier for this provider. Higher values mean its suggestions appear first in the merged list.",
  advanced: true,
};

function _all(): {
  id: string;
  displayName: string;
  instance: AutocompleteProvider;
}[] {
  return [
    ...BUILTIN_DEFINITIONS.map((d) => ({
      id: d.id,
      displayName: d.displayName,
      instance: builtinMap[d.id],
    })),
    ...pluginRegistry.items(),
  ];
}

async function _buildContext(providerId: string): Promise<AutocompleteContext> {
  const stored = await getSettings(providerId);
  const raw = asString(stored.outgoingTransport) || undefined;
  const transportName = parseOutgoingTransport(raw);
  const rawLocale = (process.env.DEGOOG_DEFAULT_SEARCH_LANGUAGE || "").trim();
  const lang = rawLocale.split(/[-_]/)[0].toLowerCase() || "en";
  return {
    fetch: (url, init) =>
      outgoingFetch(
        url as string,
        (init ?? {}) as Parameters<typeof outgoingFetch>[1],
        transportName,
      ),
    lang,
    createCache,
  };
}

export async function getEnabledAutocompleteProviders(): Promise<
  AutocompleteProvider[]
> {
  const providers: AutocompleteProvider[] = [];
  for (const p of _all()) {
    const stored = await getSettings(p.id);
    if (asString(stored.disabled) !== "true") providers.push(p.instance);
  }
  return providers;
}

export function getAutocompleteProviderById(
  id: string,
): AutocompleteProvider | undefined {
  return _all().find((p) => p.id === id)?.instance;
}

export async function getSuggestionsFromProviders(query: string): Promise<
  {
    text: string;
    source: string;
    rich?: import("../../types").RichSuggestion;
  }[]
> {
  const cacheKey = `ac:${query}`;
  const cached = autocompleteCache.get(cacheKey);
  if (cached) {
    logger.debug(
      "autocomplete",
      `cache hit key="${cacheKey}" qLen=${query.length} suggestions=${cached.length}`,
    );
    return cached;
  }

  const all = _all();

  const tasks = await Promise.all(
    all.map(async (p) => {
      const stored = await getSettings(p.id);
      if (asString(stored.disabled) === "true") return null;
      const score = Math.max(parseFloat(asString(stored.score)) || 1, 0.1);
      return {
        provider: p.instance,
        ctx: await _buildContext(p.id),
        score,
        name: p.displayName,
      };
    }),
  );

  const active = tasks.filter(Boolean).sort((a, b) => b!.score - a!.score) as {
    provider: AutocompleteProvider;
    ctx: AutocompleteContext;
    score: number;
    name: string;
  }[];

  if (active.length === 0) return [];

  logger.debug(
    "autocomplete",
    `querying ${active.length} provider(s): ${active.map((p) => p.name).join(", ")}`,
  );

  const settled = await Promise.allSettled(
    active.map(async ({ provider, ctx, name }) => {
      const t0 = performance.now();
      const results = await provider.getSuggestions(query, ctx);
      logger.debug(
        "autocomplete",
        `${name} returned ${results.length} suggestion(s) in ${Math.round(performance.now() - t0)}ms`,
      );
      return { results, name };
    }),
  );

  const lower = query.toLowerCase();

  type NormItem = {
    text: string;
    source: string;
    rich?: import("../../types").RichSuggestion;
  };

  const richItems = new Map<
    string,
    {
      text: string;
      sources: string[];
      rich: import("../../types").RichSuggestion;
    }
  >();
  const perProvider: NormItem[][] = [];

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    if (result.status === "rejected") {
      logger.warn("autocomplete", `${active[i].name} failed`, result.reason);
      perProvider.push([]);
      continue;
    }
    const { results, name } = result.value;
    const plain: NormItem[] = [];
    for (const s of results) {
      const text = typeof s === "string" ? s : s.text;
      const rich = typeof s === "object" ? s.rich : undefined;
      if (text.toLowerCase() === lower) continue;
      if (rich && (rich.description || rich.thumbnail)) {
        const key = text.toLowerCase();
        const existing = richItems.get(key);
        if (existing) {
          if (!existing.sources.includes(name)) existing.sources.push(name);
          if (!existing.rich.description && rich.description)
            existing.rich.description = rich.description;
          if (!existing.rich.thumbnail && rich.thumbnail)
            existing.rich.thumbnail = rich.thumbnail;
          if (!existing.rich.type && rich.type) existing.rich.type = rich.type;
        } else if (richItems.size < 2) {
          richItems.set(key, { text, sources: [name], rich });
        }
      } else {
        plain.push({ text, source: name });
      }
    }
    perProvider.push(plain);
  }

  const seen = new Map<string, { text: string; sources: string[] }>();
  const maxLen = perProvider.reduce((m, p) => Math.max(m, p.length), 0);
  const plainCap = 10 - richItems.size;

  outer: for (let i = 0; i < maxLen; i++) {
    for (const providerResults of perProvider) {
      if (i >= providerResults.length) continue;
      const item = providerResults[i];
      const key = item.text.toLowerCase();
      if (richItems.has(key)) continue;
      const existing = seen.get(key);
      if (existing) {
        if (!existing.sources.includes(item.source))
          existing.sources.push(item.source);
      } else {
        if (seen.size >= plainCap) break outer;
        seen.set(key, { text: item.text, sources: [item.source] });
      }
    }
  }

  const richMerged: NormItem[] = Array.from(richItems.values()).map(
    (entry) => ({
      text: entry.text,
      source: entry.sources.join(", "),
      rich: entry.rich,
    }),
  );

  const plainMerged: NormItem[] = Array.from(seen.values()).map((entry) => ({
    text: entry.text,
    source: entry.sources.join(", "),
  }));

  const merged = [...richMerged, ...plainMerged];

  logger.debug(
    "autocomplete",
    `merged ${merged.length} suggestion(s) (${richMerged.length} rich) for "${query}"`,
  );

  autocompleteCache.set(cacheKey, merged);
  return merged;
}

export async function getAutocompleteExtensionMeta(): Promise<ExtensionMeta[]> {
  const transportOptions = getTransportNames();
  const results: ExtensionMeta[] = [];

  for (const p of _all()) {
    const providerSchema: SettingField[] = p.instance.settingsSchema ?? [];
    const userSchema = providerSchema.filter(
      (f) => f.key !== "outgoingTransport" && f.key !== "score",
    );
    const builtinDef = BUILTIN_DEFINITIONS.find((d) => d.id === p.id);
    const transportDefault =
      providerSchema.find((f) => f.key === "outgoingTransport")?.default ??
      builtinDef?.defaultTransport ??
      OUTGOING_TRANSPORT_FIELD.default;

    const scoreDefault =
      providerSchema.find((f) => f.key === "score")?.default ??
      SCORE_FIELD.default;

    const transportField: SettingField = {
      ...OUTGOING_TRANSPORT_FIELD,
      options: transportOptions,
      default: transportDefault,
    };

    const scoreField: SettingField = { ...SCORE_FIELD, default: scoreDefault };

    const schema: SettingField[] = [scoreField, transportField, ...userSchema];
    const rawSettings = await getSettings(p.id);
    const maskedSettings = maskSecrets(rawSettings, schema);

    results.push({
      id: p.id,
      displayName: p.displayName,
      description: "",
      type: ExtensionStoreType.Autocomplete,
      configurable: true,
      settingsSchema: schema,
      settings: maskedSettings,
      defaultEnabled: true,
    });
  }

  return results;
}

export async function initAutocomplete(): Promise<void> {
  for (const def of BUILTIN_DEFINITIONS) {
    const instance = builtinMap[def.id];
    if (instance?.configure && instance.settingsSchema?.length) {
      const stored = await getSettings(def.id);
      instance.configure(mergeDefaults(stored, instance.settingsSchema));
    }
  }
  await pluginRegistry.init();
}

export async function reloadAutocomplete(): Promise<void> {
  await initAutocomplete();
}
