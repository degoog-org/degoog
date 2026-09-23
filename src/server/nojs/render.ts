import pkg from "../../../package.json";
import { getActiveTheme, getActiveThemeDataAttrs } from "../extensions/themes/registry";
import type { Translate } from "../types";
import { getBasePath, getBaseUrl } from "../utils/base-url";
import { mintToken } from "../utils/link-token";
import { logger } from "../utils/logger";
import { asString } from "../utils/plugin-settings";
import { getInstanceSettings } from "../utils/server-settings";
import { bootCircuitFromPath, syncVortexSignal, withBuffer } from "../utils/translation-circuit";
import { insertBeforeHeadEnd } from "./dom";
import { isNojsCssCheckOn } from "./settings";
import { loadNojsTemplate } from "./templates";

const DEFAULT_THEME_DIR = "src/public/themes/degoog-theme";
const CORE_LOCALES_ROOT = "src";
const BASE_URL = getBaseUrl();
const BASE_PATH = getBasePath();
const BASE_PREFIX =
  BASE_PATH || (BASE_URL && !/^https?:\/\//i.test(BASE_URL) ? BASE_URL : "");

const _escapeRe = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const _rootRelativeUrl = (prefix: string): RegExp =>
  new RegExp(
    `(<(?:link|script|a|form)[^>]*(?:href|src|action)=")/(?!/)(?!${_escapeRe(
      prefix.replace(/^\//, ""),
    )}(?:[/?#"]))`,
    "g",
  );

export const prefixRootRelativeUrls = (
  html: string,
  prefix: string,
): string =>
  prefix ? html.replace(_rootRelativeUrl(prefix), `$1${prefix}/`) : html;

const RTL_LANGS = ["ar", "he", "fa", "ur", "ps", "ckb"];

const NOJS_STYLESHEET = `<link rel="stylesheet" href="/public/nojs.css?v=${pkg.version}">`;
const FONTAWESOME_STYLESHEET = `<link rel="stylesheet" href="/public/icons/fontawesome/css/all.min.css?v=${pkg.version}">`;

let nojsThemeTranslator: Translate | null = null;
let nojsCoreTranslator: Translate | null = null;

export const sub = (html: string, key: string, value: string): string =>
  html.replaceAll(key, () => value);

const _getThemeTranslator = async (): Promise<Translate> => {
  if (!nojsThemeTranslator) {
    nojsThemeTranslator = await bootCircuitFromPath(DEFAULT_THEME_DIR);
  }
  return nojsThemeTranslator;
};

const _getCoreTranslator = async (): Promise<Translate> => {
  if (!nojsCoreTranslator) {
    nojsCoreTranslator = await bootCircuitFromPath(CORE_LOCALES_ROOT);
  }
  return nojsCoreTranslator;
};

export const getNojsTranslator = async (): Promise<Translate> => {
  const baseT = await _getThemeTranslator();
  const theme = await getActiveTheme();
  const themeChain = theme?.t ? withBuffer(theme.t, baseT) : baseT;
  return withBuffer(themeChain, await _getCoreTranslator());
};

export const loadNojsPartial = async (
  name: string,
  t: Translate,
  locale: string,
): Promise<string | null> => {
  const template = await loadNojsTemplate(name);
  if (template === null) return null;
  return syncVortexSignal(template, t, locale);
};

const _textDirection = (locale: string): "rtl" | "ltr" =>
  RTL_LANGS.some((lang) => locale.toLowerCase().startsWith(lang))
    ? "rtl"
    : "ltr";

const _themeCssLink = async (): Promise<string> => {
  const theme = await getActiveTheme();
  if (!theme?.manifest.css) return "";
  return `<link rel="stylesheet" href="/theme/style.css?v=${pkg.version}&theme=${encodeURIComponent(theme.id)}">`;
};

const _customCssTag = async (): Promise<string> => {
  const settings = await getInstanceSettings();
  const css = asString(settings.customCss).trim();
  if (!css) return "";
  return `<style id="degoog-custom-css">${css.replace(/<\//g, "<\\/")}</style>`;
};

const _cssPingLink = async (): Promise<string> => {
  if (!(await isNojsCssCheckOn())) return "";
  try {
    return `<link rel="stylesheet" href="/style/v/${mintToken()}">`;
  } catch (err) {
    logger.error("nojs", "failed to mint css check token", err);
    return "";
  }
};

const _themeMode = async (): Promise<string> => {
  const settings = await getInstanceSettings();
  const fallback = asString(settings.defaultTheme);
  return fallback === "light" || fallback === "dark" ? fallback : "";
};

const _themeAttrs = async (): Promise<string> => {
  const mode = await _themeMode();
  const extra = await getActiveThemeDataAttrs();
  return mode ? ` data-theme="${mode}"${extra}` : extra;
};

export const applyNojsPlaceholders = async (
  html: string,
  t: Translate,
  locale: string,
): Promise<string> => {
  let result = sub(html, "__LANG_ATTR__", locale || "en");
  result = sub(result, "__THEME_ATTRS__", await _themeAttrs());
  result = sub(result, "__RTL_SUPPORT__", `dir="${_textDirection(locale)}"`);
  result = sub(result, "__THEME_CSS__", await _themeCssLink());
  result = sub(result, "__CUSTOM_CSS__", await _customCssTag());
  result = sub(result, "__PLUGIN_ASSETS__", "");
  result = sub(result, "__THEME_TEMPLATES__", "");
  result = sub(result, "__APP_VERSION__", pkg.version);

  result = syncVortexSignal(result, t, locale);

  result = prefixRootRelativeUrls(result, BASE_PREFIX);

  return result;
};

export const buildNojsDocument = async (
  content: string,
  locale: string,
  bodyClass: string,
): Promise<string | null> => {
  const layout = await loadNojsTemplate("layout");
  if (!layout) {
    logger.error("nojs", "missing nojs layout template");
    return null;
  }

  let html = sub(layout, "__PAGE_CONTENT__", content);
  html = sub(html, "__BODY_CLASS__", `class="${bodyClass}"`);
  html = await insertBeforeHeadEnd(
    html,
    `${NOJS_STYLESHEET}\n    ${FONTAWESOME_STYLESHEET}\n    ${await _cssPingLink()}\n  `,
  );

  return applyNojsPlaceholders(html, await getNojsTranslator(), locale);
};

export const loadNojsShell = async (name: string): Promise<string | null> => {
  const shell = await loadNojsTemplate(name);
  if (!shell) logger.error("nojs", `missing nojs shell template: ${name}`);
  return shell;
};
