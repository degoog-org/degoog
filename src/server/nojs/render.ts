import pkg from "../../../package.json";
import { getActiveTheme, getActiveThemeDataAttrs } from "../extensions/themes/registry";
import type { Translate } from "../types/extension";
import { mintToken } from "../utils/security/link-token";
import { logger } from "../utils/logger";
import { asString } from "../utils/settings/plugin-settings";
import { getInstanceSettings } from "../utils/settings/server-settings";
import { syncVortexSignal, withBuffer } from "../utils/extension-support/translation-circuit";
import { insertBeforeHeadEnd } from "./dom";
import {
  basePrefix,
  customCssTag,
  getCoreTranslator,
  getDefaultThemeTranslator,
  textDirection,
  themeCssLink,
} from "../render/theme-assets";
import { isNojsCssCheckOn } from "./settings";
import { loadNojsTemplate } from "./templates";

const BASE_PREFIX = basePrefix();

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

const NOJS_STYLESHEET = `<link rel="stylesheet" href="/public/nojs.css?v=${pkg.version}">`;
const FONTAWESOME_STYLESHEET = `<link rel="stylesheet" href="/public/icons/fontawesome/css/all.min.css?v=${pkg.version}">`;

export const sub = (html: string, key: string, value: string): string =>
  html.replaceAll(key, () => value);

export const getNojsTranslator = async (): Promise<Translate> => {
  const baseT = await getDefaultThemeTranslator();
  const theme = await getActiveTheme();
  const themeChain = theme?.t ? withBuffer(theme.t, baseT) : baseT;
  return withBuffer(themeChain, await getCoreTranslator());
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

const applyNojsPlaceholders = async (
  html: string,
  t: Translate,
  locale: string,
): Promise<string> => {
  let result = sub(html, "__LANG_ATTR__", locale || "en");
  result = sub(result, "__THEME_ATTRS__", await _themeAttrs());
  result = sub(result, "__RTL_SUPPORT__", `dir="${textDirection(locale)}"`);
  result = sub(result, "__THEME_CSS__", await themeCssLink());
  result = sub(result, "__CUSTOM_CSS__", await customCssTag());
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
