import { authHeaders, jsonHeaders } from "../../../utils/net/request";
import { getBase } from "../../../utils/net/base-url";
import { getStoredToken } from "../../../utils/settings/settings-token";
import {
  COMPAT_ADD_PATH,
  CompatAction,
  compatApiUrl,
  type CompatCatalogItem,
  CompatLayerId,
} from "../../../../shared/compat-layers";
import {
  compatErrorText,
  compatFlagOn,
  parseCompatCatalogue,
} from "./compat-parse";

export { CompatAction, CompatLayerId };

export interface CompatLayerView {
  id: CompatLayerId;
  label: string;
  settingKey: string;
}

export const COMPAT_LAYER_VIEWS: readonly CompatLayerView[] = Object.freeze([
  {
    id: CompatLayerId.Searx,
    label: "SearX",
    settingKey: "searxCompatEnabled",
  },
  {
    id: CompatLayerId.FourGet,
    label: "4get",
    settingKey: "fourgetCompatEnabled",
  },
]);

export const enabledLayers = async (): Promise<CompatLayerView[]> => {
  try {
    const res = await fetch(`${getBase()}/api/settings/general`, {
      headers: authHeaders(getStoredToken),
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return COMPAT_LAYER_VIEWS.filter((layer) => compatFlagOn(data, layer.settingKey));
  } catch (err) {
    console.warn("[settings] compatibility layer flags load failed", err);
    return [];
  }
};

export const fetchCompat = async (
  layer: CompatLayerId,
): Promise<CompatCatalogItem[]> => {
  const res = await fetch(`${getBase()}${compatApiUrl(layer, "engines")}`, {
    headers: authHeaders(getStoredToken),
  });
  if (!res.ok) throw new Error(`Failed to load the ${layer} catalogue`);
  return parseCompatCatalogue(await res.json());
};

export const sendCompat = async (
  layer: CompatLayerId,
  action: CompatAction,
  code: string,
): Promise<void> => {
  const res = await fetch(`${getBase()}${compatApiUrl(layer, action)}`, {
    method: "POST",
    headers: jsonHeaders(getStoredToken),
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const data: unknown = await res.json().catch(() => ({}));
    throw new Error(compatErrorText(data, `${layer} ${action} failed`));
  }
};

export const addCompat = async (
  layer: CompatLayerId,
  source: string,
): Promise<void> => {
  const res = await fetch(`${getBase()}${compatApiUrl(layer, COMPAT_ADD_PATH)}`, {
    method: "POST",
    headers: jsonHeaders(getStoredToken),
    body: JSON.stringify({ source }),
  });
  if (!res.ok) {
    const data: unknown = await res.json().catch(() => ({}));
    throw new Error(compatErrorText(data, `${layer} add failed`));
  }
};
