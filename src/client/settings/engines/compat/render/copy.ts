const t = window.scopedT("core");

const KEY = "settings-page.extensions.";

export const WEB_TYPE = "web";

export const copy = (
  key: string,
  layer: string,
  extra?: Record<string, string>,
): string => t(`${KEY}${key}`, { layer, ...extra });
