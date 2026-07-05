import {
  type AutocompleteProvider,
  type AutocompleteContext,
  type ExtensionMeta,
  ExtensionStoreType,
  type SettingField,
} from "../../types";
import {
  asBoolean,
  asString,
  getSettings,
  maskSecrets,
  mergeDefaults,
} from "../../utils/plugin-settings";
import { autocompleteDir } from "../../utils/paths";
import { autocompleteCache } from "../../utils/cache";
import { getTransportNames, getTransportDisplayNames } from "../transports/registry";
import { createRegistry } from "../registry-factory";
import { makeExtID } from "../../utils/extension-id";
import { logger } from "../../utils/logger";
import { signSuggestionThumbnails } from "../../utils/proxy-sign";
import { buildProviderContext } from "./context";
import { mergeSuggestions } from "./merge";
import { AUTOCOMPLETE_TIMEOUT_MS, withTimeout } from "../../utils/with-timeout";
import { isExtensionRestartFlagVisible } from "../../utils/restart-state";

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
  dirs: () => [{ dir: autocompleteDir() }],
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
    entry.id = makeExtID(folderName, "autocomplete");
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
  return pluginRegistry.items();
}

export async function getEnabledAutocompleteProviders(): Promise<
  AutocompleteProvider[]
> {
  const providers: AutocompleteProvider[] = [];
  for (const p of _all()) {
    const stored = await getSettings(p.id);
    if (!asBoolean(stored.disabled)) providers.push(p.instance);
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
  const cached = await autocompleteCache.get(cacheKey);
  if (cached) {
    logger.debug(
      "autocomplete",
      `cache hit key="${cacheKey}" qLen=${query.length} suggestions=${cached.length}`,
    );
    return signSuggestionThumbnails(cached);
  }

  const all = _all();

  const tasks = await Promise.all(
    all.map(async (p) => {
      const stored = await getSettings(p.id);
      if (asBoolean(stored.disabled)) return null;
      const score = Math.max(parseFloat(asString(stored.score)) || 1, 0.1);
      return {
        provider: p.instance,
        ctx: await buildProviderContext(p.id),
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
      const results = await withTimeout(
        Promise.resolve(provider.getSuggestions(query, ctx)),
        AUTOCOMPLETE_TIMEOUT_MS,
        `autocomplete ${name}`,
      );
      logger.debug(
        "autocomplete",
        `${name} returned ${results.length} suggestion(s) in ${Math.round(performance.now() - t0)}ms`,
      );
      return { results, name };
    }),
  );

  const providerResults = settled.map((result, i) => {
    if (result.status === "rejected") {
      logger.warn("autocomplete", `${active[i].name} failed`, result.reason);
      return { results: [], name: active[i].name };
    }
    return result.value;
  });

  const merged = mergeSuggestions(providerResults, query);

  logger.debug(
    "autocomplete",
    `merged ${merged.length} suggestion(s) for "${query}"`,
  );

  await autocompleteCache.set(cacheKey, merged);
  return signSuggestionThumbnails(merged);
}

export async function getAutocompleteExtensionMeta(): Promise<ExtensionMeta[]> {
  const transportOptions = getTransportNames();
  const transportLabels = getTransportDisplayNames();
  const results: ExtensionMeta[] = [];

  for (const p of _all()) {
    const providerSchema: SettingField[] = p.instance.settingsSchema ?? [];
    const userSchema = providerSchema.filter(
      (f) => f.key !== "outgoingTransport" && f.key !== "score",
    );
    const transportDefault =
      providerSchema.find((f) => f.key === "outgoingTransport")?.default ??
      OUTGOING_TRANSPORT_FIELD.default;

    const scoreDefault =
      providerSchema.find((f) => f.key === "score")?.default ??
      SCORE_FIELD.default;

    const transportField: SettingField = {
      ...OUTGOING_TRANSPORT_FIELD,
      options: transportOptions,
      optionLabels: transportLabels,
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
      needsAppRestart: isExtensionRestartFlagVisible(p.instance.needsAppRestart),
    });
  }

  return results;
}

export async function initAutocomplete(bust = false): Promise<void> {
  await (bust ? pluginRegistry.reload() : pluginRegistry.init());
}

export async function reloadAutocomplete(bust = true): Promise<void> {
  await initAutocomplete(bust);
}
