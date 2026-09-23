import type { SearchEngine } from "../../types/extension";
import type { EngineFilters } from "../../../shared/engine-filters";
import {
  COMPAT_LAYER_LABELS,
  CompatLayerId,
  type CompatCatalogItem,
  type CompatLayerInfo,
} from "../../../shared/compat-layers";
import { getInstanceSettings } from "../../utils/settings/server-settings";
import { asBoolean } from "../../utils/settings/plugin-settings";
import {
  installSearx,
  listSearxItems,
  uninstallSearx,
  updateSearx,
  withSearxLock,
} from "./searx/install";
import { loadSearxCompatibilityEngines } from "./searx";
import {
  installFourGet,
  listFourGetItems,
  uninstallFourGet,
  updateFourGet,
  withFourGetLock,
} from "./fourget/install";
import { loadFourGetEngines } from "./fourget";

export interface CompatEntry {
  id: string;
  displayName: string;
  searchTypes: string[];
  description?: string;
  site?: string;
  instance: SearchEngine;
  disabledByDefault?: boolean;
  source?: "plugin" | "builtin";
  compatibilityLayer?: CompatLayerId;
  filters?: EngineFilters;
}

export interface CompatLayerDef extends CompatLayerInfo {
  loadEngines: () => Promise<CompatEntry[]>;
  listItems: () => Promise<CompatCatalogItem[]>;
  install: (code: string) => Promise<void>;
  update: (code: string) => Promise<void>;
  uninstall: (code: string) => Promise<void>;
  lock: <T>(task: () => Promise<T>) => Promise<T>;
}

export const SEARX_SETTING_KEY = "searxCompatEnabled";
export const FOURGET_SETTING_KEY = "fourgetCompatEnabled";

const _searxItems = async (): Promise<CompatCatalogItem[]> =>
  (await listSearxItems()).map((item) => ({
    code: item.code,
    name: item.name,
    types: [...item.types],
    site: item.site,
    deps: item.deps ? [...item.deps] : undefined,
    notes: [],
    installed: item.installed,
    missingDeps: [...item.missingDeps],
    runtime: item.libs.map((lib) => ({
      module: lib.module,
      package: lib.package,
      missing: lib.missing,
    })),
  }));

export const COMPAT_LAYERS: readonly CompatLayerDef[] = Object.freeze([
  {
    id: CompatLayerId.Searx,
    label: COMPAT_LAYER_LABELS[CompatLayerId.Searx],
    settingKey: SEARX_SETTING_KEY,
    loadEngines: loadSearxCompatibilityEngines,
    listItems: _searxItems,
    install: installSearx,
    update: updateSearx,
    uninstall: uninstallSearx,
    lock: withSearxLock,
  },
  {
    id: CompatLayerId.FourGet,
    label: COMPAT_LAYER_LABELS[CompatLayerId.FourGet],
    settingKey: FOURGET_SETTING_KEY,
    loadEngines: loadFourGetEngines,
    listItems: listFourGetItems,
    install: installFourGet,
    update: updateFourGet,
    uninstall: uninstallFourGet,
    lock: withFourGetLock,
  },
]);

export const compatLayer = (id: string): CompatLayerDef | undefined =>
  COMPAT_LAYERS.find((layer) => layer.id === id);

export const COMPAT_SETTING_KEYS: readonly string[] = Object.freeze(
  COMPAT_LAYERS.map((layer) => layer.settingKey),
);

export const isLayerOn = async (layer: CompatLayerDef): Promise<boolean> => {
  const settings = await getInstanceSettings();
  return asBoolean(settings[layer.settingKey as keyof typeof settings]);
};

export const loadCompatEngines = async (): Promise<CompatEntry[]> => {
  const out: CompatEntry[] = [];
  for (const layer of COMPAT_LAYERS) {
    out.push(...(await layer.loadEngines()));
  }
  return out;
};
