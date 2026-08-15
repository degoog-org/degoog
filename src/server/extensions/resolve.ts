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
import type {
  AutocompleteProvider,
  BangCommand,
  ExtensionMeta,
  GetFieldOptions,
  QueryInterceptor,
  SearchEngine,
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
  transport: Transport | null;
  autocomplete: AutocompleteProvider | null;
}

type LiveTarget = NonNullable<ResolvedExtension[keyof ResolvedExtension]>;

export const getAllExtensionMeta = async (): Promise<ExtensionMeta[]> => {
  const coreT = await getCoreTranslator();
  const groups = await Promise.all([
    getEngineExtensionMeta(coreT),
    getPluginExtensionMeta(coreT),
    getSlotExtensionMeta(coreT),
    getInterceptorMeta(),
    getSearchBarActionExtensionMeta(),
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

export const resolveExtension = (id: string): ResolvedExtension => ({
  engine: getEngineMap()[id] ?? null,
  command: getCommandInstanceById(id) ?? null,
  slot: findSlotBySettingsId(id),
  interceptor: getInterceptorBySettingsId(id),
  transport: id.endsWith(TRANSPORT_SUFFIX) ? (getTransport(id) ?? null) : null,
  autocomplete: id.endsWith(AUTOCOMPLETE_SUFFIX)
    ? (getAutocompleteProviderById(id) ?? null)
    : null,
});

const liveTargets = (resolved: ResolvedExtension): LiveTarget[] =>
  [
    resolved.engine,
    resolved.command,
    resolved.slot,
    resolved.interceptor,
    resolved.transport,
    resolved.autocomplete,
  ].filter((entry): entry is LiveTarget => entry !== null);

export const findOptionsProvider = (id: string): GetFieldOptions | null => {
  const resolved = resolveExtension(id);
  for (const target of liveTargets(resolved)) {
    if (typeof target.getFieldOptions === "function") {
      return target.getFieldOptions.bind(target);
    }
  }
  return null;
};
