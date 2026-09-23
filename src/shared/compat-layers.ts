export enum CompatLayerId {
  Searx = "searx",
  FourGet = "4get",
}

export const COMPAT_LAYER_IDS: readonly CompatLayerId[] = Object.freeze([
  CompatLayerId.Searx,
  CompatLayerId.FourGet,
]);

export const COMPAT_LAYER_LABELS: Readonly<Record<CompatLayerId, string>> =
  Object.freeze({
    [CompatLayerId.Searx]: "SearX",
    [CompatLayerId.FourGet]: "4get",
  });

export const COMPAT_LAYER_REPOS: Readonly<Record<CompatLayerId, string>> =
  Object.freeze({
    [CompatLayerId.Searx]: "https://github.com/searxng/searxng",
    [CompatLayerId.FourGet]: "https://git.lolcat.ca/lolcat/4get",
  });
export interface CompatRuntimeNeed {
  module: string;
  package: string;
  missing: boolean;
}

export interface CompatCatalogItem {
  code: string;
  name: string;
  types: string[];
  site?: string;
  deps?: string[];
  notes?: string[];
  installed: boolean;
  missingDeps: string[];
  runtime: CompatRuntimeNeed[];
}

export interface CompatLayerInfo {
  id: CompatLayerId;
  label: string;
  settingKey: string;
}

export enum CompatAction {
  Install = "install",
  Update = "update",
  Uninstall = "uninstall",
}

export const COMPAT_API_BASE = "/api/compat";

export const compatApiUrl = (layer: CompatLayerId, path: string): string =>
  `${COMPAT_API_BASE}/${encodeURIComponent(layer)}/${path}`;
