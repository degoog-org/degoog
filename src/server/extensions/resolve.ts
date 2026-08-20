import { getCoreTranslator } from "../routes/pages";
import { getEngineExtensionMeta, getEngineMap } from "./engines/registry";
import {
  getPluginExtensionMeta,
  getCommandInstanceById,
} from "./commands/registry";
import {
  getSlotPlugins,
  getSlotPluginById,
  getSlotExtensionMeta,
} from "./slots/registry";
import {
  getInterceptorMeta,
  getInterceptorBySettingsId,
} from "./interceptors/registry";
import { getSearchBarActionExtensionMeta } from "./search-bar/registry";
import { getThemeExtensionMeta } from "./themes/registry";
import { getTransportExtensionMeta, getTransport } from "./transports/registry";
import {
  getAutocompleteExtensionMeta,
  getAutocompleteProviderById,
} from "./autocomplete/registry";
import { getShortcutExtensionMeta } from "./shortcuts/registry";
import {
  getSearchResultTabById,
  getSearchResultTabExtensionMeta,
  getSearchResultTabs,
} from "./search-result-tabs/registry";
import type {
  AutocompleteProvider,
  BangCommand,
  ExtensionMeta,
  GetFieldOptions,
  QueryInterceptor,
  SearchEngine,
  SearchResultTab,
  SlotPlugin,
  Transport,
} from "../types";

const TRANSPORT_SUFFIX = "-transport";
const AUTOCOMPLETE_SUFFIX = "-autocomplete";

export interface ResolvedExtension {
  engine: SearchEngine | null;
  command: BangCommand | null;
  slot: SlotPlugin | null;
  interceptor: QueryInterceptor | null;
  tab: SearchResultTab | null;
  transport: Transport | null;
  autocomplete: AutocompleteProvider | null;
}

type LiveTarget = NonNullable<ResolvedExtension[keyof ResolvedExtension]>;

type OptionsHost = {
  getFieldOptions?: GetFieldOptions;
  pluginManifest?: { getFieldOptions?: GetFieldOptions };
};

export const getAllExtensionMeta = async (): Promise<ExtensionMeta[]> => {
  const coreT = await getCoreTranslator();
  const groups = await Promise.all([
    getEngineExtensionMeta(coreT),
    getPluginExtensionMeta(coreT),
    getSlotExtensionMeta(coreT),
    getInterceptorMeta(),
    getSearchBarActionExtensionMeta(),
    getSearchResultTabExtensionMeta(),
    getThemeExtensionMeta(),
    getTransportExtensionMeta(),
    getAutocompleteExtensionMeta(),
    getShortcutExtensionMeta(),
  ]);
  return groups.flat();
};

export const findExtensionMeta = async (
  id: string,
): Promise<ExtensionMeta | null> =>
  (await getAllExtensionMeta()).find((e) => e.id === id) ?? null;

const findSlotBySettingsId = (id: string): SlotPlugin | null => {
  const slotId = getSlotPlugins().find((s) => (s.settingsId ?? s.id) === id)?.id;
  return slotId ? getSlotPluginById(slotId) : null;
};

const findTabBySettingsId = (id: string): SearchResultTab | null => {
  const tabId = getSearchResultTabs().find((t) => (t.settingsId ?? t.id) === id)
    ?.id;
  return tabId ? getSearchResultTabById(tabId) : null;
};

export const resolveExtension = (id: string): ResolvedExtension => ({
  engine: getEngineMap()[id] ?? null,
  command: getCommandInstanceById(id) ?? null,
  slot: findSlotBySettingsId(id),
  interceptor: getInterceptorBySettingsId(id),
  tab: findTabBySettingsId(id),
  transport: id.endsWith(TRANSPORT_SUFFIX) ? (getTransport(id) ?? null) : null,
  autocomplete: id.endsWith(AUTOCOMPLETE_SUFFIX)
    ? (getAutocompleteProviderById(id) ?? null)
    : null,
});

const liveTargets = (resolved: ResolvedExtension): LiveTarget[] => {
  const entries: Array<LiveTarget | null> = [
    resolved.engine,
    resolved.command,
    resolved.slot,
    resolved.interceptor,
    resolved.tab,
    resolved.transport,
    resolved.autocomplete,
  ];
  return entries.filter((entry): entry is LiveTarget => entry !== null);
};

const bindOptionsProvider = (
  host: OptionsHost | null | undefined,
): GetFieldOptions | null => {
  if (typeof host?.getFieldOptions === "function") {
    return host.getFieldOptions.bind(host);
  }
  if (typeof host?.pluginManifest?.getFieldOptions === "function") {
    return host.pluginManifest.getFieldOptions.bind(host.pluginManifest);
  }
  return null;
};

export const findOptionsProvider = (id: string): GetFieldOptions | null => {
  const resolved = resolveExtension(id);
  for (const target of liveTargets(resolved)) {
    const provider = bindOptionsProvider(target);
    if (provider) return provider;
  }
  return null;
};
