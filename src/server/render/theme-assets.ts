import pkg from "../../../package.json";
import { getActiveTheme } from "../extensions/themes/registry";
import { bootCircuitFromPath } from "../utils/extension-support/translation-circuit";
import { getInstanceSettings } from "../utils/settings/server-settings";
import { asString } from "../utils/settings/plugin-settings";
import { getBasePath, getBaseUrl } from "../utils/net/base-url";
import type { Translate } from "../types/extension";

export const DEFAULT_THEME_DIR = "src/public/themes/degoog-theme";
const CORE_LOCALES_ROOT = "src";

export const basePrefix = (): string => {
  const basePath = getBasePath();
  const baseUrl = getBaseUrl();
  return basePath || (baseUrl && !/^https?:\/\//i.test(baseUrl) ? baseUrl : "");
};

const RTL_LANGS = ["ar", "he", "fa", "ur", "ps", "ckb"];

export const textDirection = (locale: string): "rtl" | "ltr" =>
  RTL_LANGS.some((lang) => locale.toLowerCase().startsWith(lang)) ? "rtl" : "ltr";

let _themeTranslator: Translate | null = null;
let _coreTranslator: Translate | null = null;

export const getDefaultThemeTranslator = async (): Promise<Translate> => {
  if (!_themeTranslator) {
    _themeTranslator = await bootCircuitFromPath(DEFAULT_THEME_DIR);
  }
  return _themeTranslator;
};

export const getCoreTranslator = async (): Promise<Translate> => {
  if (!_coreTranslator) {
    _coreTranslator = await bootCircuitFromPath(CORE_LOCALES_ROOT);
  }
  return _coreTranslator;
};

export const themeCssLink = async (): Promise<string> => {
  const theme = await getActiveTheme();
  if (!theme?.manifest.css) return "";
  return `<link rel="stylesheet" href="/theme/style.css?v=${pkg.version}&theme=${encodeURIComponent(theme.id)}">`;
};

export const customCssTag = async (): Promise<string> => {
  const settings = await getInstanceSettings();
  const css = asString(settings.customCss).trim();
  if (!css) return "";
  return `<style id="degoog-custom-css">${css.replace(/<\//g, "<\\/")}</style>`;
};
