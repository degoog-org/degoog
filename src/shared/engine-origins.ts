import { CompatLayerId } from "./compat-layers";

export enum EngineOriginKind {
  Core = "core",
  Store = "store",
  Compat = "compat",
}

export enum EngineOriginDisplay {
  Favicon = "favicon",
  Provenance = "provenance",
  Off = "off",
}

export const ENGINE_ORIGIN_DISPLAY_VALUES: readonly string[] = Object.freeze(
  Object.values(EngineOriginDisplay),
);

export const DEFAULT_ENGINE_ORIGIN_DISPLAY = EngineOriginDisplay.Favicon;

const ORIGIN_ICON_DIR = "/public/images/origins";

export const CORE_ORIGIN_ICON = "/public/images/degoog-logo.svg";
export const STORE_ORIGIN_GLYPH = "fa-store";

export const COMPAT_ORIGIN_ICONS: Readonly<Record<CompatLayerId, string>> =
  Object.freeze({
    [CompatLayerId.Searx]: `${ORIGIN_ICON_DIR}/searx.png`,
    [CompatLayerId.FourGet]: `${ORIGIN_ICON_DIR}/4get.png`,
  });

export const CORE_ORIGIN_LABEL = "Degoog";

export const isOriginDisplay = (value: unknown): value is EngineOriginDisplay =>
  typeof value === "string" && ENGINE_ORIGIN_DISPLAY_VALUES.includes(value);

export interface EngineOrigin {
  kind: EngineOriginKind;
  label: string;
  icon?: string;
  glyph?: string;
  favicon?: string;
  siteLabel?: string;
}
