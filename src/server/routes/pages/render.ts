import { readFile } from "fs/promises";
import { join } from "path";
import pkg from "../../../../package.json";
import { getAllCommandTranslators } from "../../extensions/commands/registry";
import { getAllEngineTranslators } from "../../extensions/engines/registry";
import { getAllMiddlewareTranslators } from "../../extensions/middleware/registry";
import { getAllSearchBarTranslators } from "../../extensions/search-bar/registry";
import { getAllTabTranslators } from "../../extensions/search-result-tabs/registry";
import { getAllSlotTranslators } from "../../extensions/slots/registry";
import {
  getActiveTheme,
  getActiveThemeDataAttrs,
  getThemeHtml,
  getThemeTemplatesHtml,
} from "../../extensions/themes/registry";
import { Translate } from "../../types";
import {
  getAllPluginCss,
  getPluginScriptFolders,
  getPluginSettingsIds,
} from "../../utils/plugin-assets";
import { asBoolean, asString, isDisabled } from "../../utils/plugin-settings";
import {
  compileLexicons,
  bootCircuitFromPath,
  syncVortexSignal,
  withBuffer,
} from "../../utils/translation-circuit";
import { mintToken } from "../../utils/link-token";
import { cssCheckOn } from "../../utils/bot-trap";
import { logger } from "../../utils/logger";
import { generateSearchNonce } from "../../utils/search-nonce";
import { getBasePath, getBaseUrl } from "../../utils/base-url";
import { getInstanceSettings } from "../../utils/server-settings";
import { readShortcutsSettings } from "../../utils/shortcuts-settings";
import { getClientShortcuts } from "../../extensions/shortcuts/registry";
import { isPasswordRequired } from "../settings-auth";
import { readSyncedDefaults } from "../../utils/synced-settings";
import { buildSettingsNav, buildSettingsTabSelect } from "./settings-nav";

export const DEFAULT_THEME_DIR = "src/public/themes/degoog-theme";
const CORE_LOCALES_ROOT = "src";
const BASE_URL = getBaseUrl();
const BASE_PATH = getBasePath();
const BASE_PREFIX =
  BASE_PATH || (BASE_URL && !/^https?:\/\//i.test(BASE_URL) ? BASE_URL : "");

interface DefaultThemeManifest {
  templates?: Record<string, string>;
}

let defaultManifestCache: DefaultThemeManifest | null = null;
let defaultThemeTranslator: Translate | null = null;
let coreTranslator: Translate | null = null;

async function getDefaultManifest(): Promise<DefaultThemeManifest> {
  if (defaultManifestCache) return defaultManifestCache;
  const raw = await readFile(join(DEFAULT_THEME_DIR, "theme.json"), "utf-8");
  defaultManifestCache = JSON.parse(raw) as DefaultThemeManifest;
  return defaultManifestCache;
}

async function getDefaultTemplatesHtml(): Promise<string> {
  const manifest = await getDefaultManifest();
  if (!manifest.templates) return "";
  const parts: string[] = [];
  for (const [id, filePath] of Object.entries(manifest.templates)) {
    const content = await readFile(join(DEFAULT_THEME_DIR, filePath), "utf-8");
    parts.push(`<template id="degoog-${id}">${content}</template>`);
  }
  return parts.join("\n");
}

async function getDefaultThemeTranslator(): Promise<Translate> {
  if (!defaultThemeTranslator) {
    defaultThemeTranslator = await bootCircuitFromPath(DEFAULT_THEME_DIR);
  }
  return defaultThemeTranslator;
}

export async function getCoreTranslator(): Promise<Translate> {
  if (!coreTranslator) {
    coreTranslator = await bootCircuitFromPath(CORE_LOCALES_ROOT);
  }
  return coreTranslator;
}

export async function getTranslator(
  _locale?: string,
  themed = false,
): Promise<Translate> {
  const baseT = await getDefaultThemeTranslator();
  const theme = getActiveTheme();
  const themeChain = themed && theme?.t ? withBuffer(theme.t, baseT) : baseT;
  const coreT = await getCoreTranslator();
  return withBuffer(themeChain, coreT);
}

function getTextDirection(locale: string): "rtl" | "ltr" {
  const RTL_LANGS = ["ar", "he", "fa", "ur", "ps", "ckb"];
  const isRTL = RTL_LANGS.some((lang) => locale.toLowerCase().startsWith(lang));
  return isRTL ? "rtl" : "ltr";
}

function themeCssPlaceholder(): string {
  const theme = getActiveTheme();
  if (!theme?.manifest.css) return "";
  return `<link rel="stylesheet" href="/theme/style.css?v=${pkg.version}">`;
}

const customCssPlaceholder = async (): Promise<string> => {
  const settings = await getInstanceSettings();
  const css = asString(settings.customCss).trim();
  if (!css) return "";
  const safe = css.replace(/<\//g, "<\\/");
  return `<style id="degoog-custom-css">${safe}</style>`;
};

async function pluginAssetsPlaceholder(): Promise<string> {
  const v = pkg.version;
  const parts: string[] = [];
  if (getAllPluginCss())
    parts.push(`<link rel="stylesheet" href="/api/plugins/styles.css?v=${v}">`);
  for (const folder of getPluginScriptFolders()) {
    const settingsIds = getPluginSettingsIds(folder);
    let disabled = false;
    for (const sid of settingsIds) {
      if (await isDisabled(sid)) {
        disabled = true;
        break;
      }
    }
    if (disabled) continue;
    parts.push(
      `<script type="module" src="/plugins/${folder}/script.js?v=${v}"><\/script>`,
    );
  }
  return parts.join("\n  ");
}

export async function applyPagePlaceholders(
  html: string,
  t: Translate,
  locale?: string,
): Promise<string> {
  const themeAttrs = await getActiveThemeDataAttrs();
  const resolvedLocale = locale || "en";

  const entries: { namespace: string; translator: Translate }[] = [
    {
      namespace: "core",
      translator: await getCoreTranslator(),
    },
    {
      namespace: "themes/degoog",
      translator: await getDefaultThemeTranslator(),
    },
    ...getAllCommandTranslators(),
    ...getAllSlotTranslators(),
    ...getAllTabTranslators(),
    ...getAllEngineTranslators(),
    ...getAllMiddlewareTranslators(),
    ...getAllSearchBarTranslators(),
  ];
  const theme = getActiveTheme();

  if (theme?.t && theme.manifest?.name) {
    entries.push({
      namespace: `themes/${theme.manifest.name}`,
      translator: theme.t,
    });
  }

  const clientTranslations = compileLexicons(entries, resolvedLocale);
  const safeJson = JSON.stringify(clientTranslations).replace(/<\//g, "<\\/");
  const translationsScript = `<script>window.__DEGOOG_T__=${safeJson}</script>\n  <script src="/public/t.js?v=${pkg.version}"></script>`;

  let result = html
    .replace("__LANG_ATTR__", resolvedLocale)
    .replace("__THEME_CSS__", themeCssPlaceholder())
    .replace("__THEME_ATTRS__", themeAttrs)
    .replace("__PLUGIN_ASSETS__", await pluginAssetsPlaceholder())
    .replace("__CUSTOM_CSS__", await customCssPlaceholder())
    .replace("__RTL_SUPPORT__", `dir=${getTextDirection(resolvedLocale)}`);
  const defaultTemplates = await getDefaultTemplatesHtml();
  const themeTemplates = await getThemeTemplatesHtml();
  const allTemplates = [defaultTemplates, themeTemplates]
    .filter(Boolean)
    .join("\n");
  if (result.includes("__THEME_TEMPLATES__")) {
    result = result.replace("__THEME_TEMPLATES__", allTemplates);
  } else if (allTemplates) {
    result = result.replace("</body>", `${allTemplates}\n</body>`);
  }
  result = result.replaceAll("__APP_VERSION__", pkg.version);

  const pageSettings = await getInstanceSettings();
  const anyApiKeyEnabled =
    asBoolean(pageSettings.apiKeySearchEnabled) ||
    asBoolean(pageSettings.apiKeySuggestEnabled);
  if (anyApiKeyEnabled) {
    const auth = generateSearchNonce();
    const nonceScript = `<script>window.__DEGOOG_SEARCH_AUTH__=${JSON.stringify(auth)}</script>`;
    result = result.replace("</head>", `${nonceScript}\n  </head>`);
  }

  result = result.replace("</head>", `${translationsScript}\n  </head>`);

  result = syncVortexSignal(result, t, resolvedLocale);

  const acDebounceMs = parseInt(asString(pageSettings.acDebounceMs), 10);
  const acDebounce =
    Number.isFinite(acDebounceMs) && acDebounceMs >= 0 ? acDebounceMs : 150;
  const acScript = `<script>window.__DEGOOG_AC_DEBOUNCE__=${acDebounce}</script>`;
  result = result.replace("</head>", `${acScript}\n  </head>`);

  const shortcutSettings = await readShortcutsSettings();
  const shortcutsConfig = {
    bindings: shortcutSettings.bindings,
    custom: await getClientShortcuts(),
  };
  const safeShortcuts = JSON.stringify(shortcutsConfig).replace(/<\//g, "<\\/");
  const shortcutsScript = `<script>window.__DEGOOG_SHORTCUTS__=${safeShortcuts}</script>`;
  result = result.replace("</head>", `${shortcutsScript}\n  </head>`);

  const syncedDefaults = await readSyncedDefaults();
  if (Object.keys(syncedDefaults).length > 0) {
    const safeSync = JSON.stringify(syncedDefaults).replace(/<\//g, "<\\/");
    const syncScript = `<script>window.__DEGOOG_SYNCED_DEFAULTS__=${safeSync}</script>`;
    result = result.replace("</head>", `${syncScript}\n  </head>`);
  }

  result = result.replace(
    "</head>",
    `<link rel="stylesheet" href="/public/icons/fontawesome/css/all.min.css?v=${pkg.version}">\n  </head>`,
  );

  if (await cssCheckOn()) {
    try {
      const tok = mintToken();
      result = result.replace(
        "</head>",
        `<link rel="stylesheet" href="/style/v/${tok}">\n  </head>`,
      );
    } catch (e) {
      logger.error(
        "link-token",
        `failed to mint token: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  if (BASE_PREFIX) {
    const baseScript = `<script>window.__DEGOOG_BASE_URL__=${JSON.stringify(BASE_PREFIX)}</script>`;
    result = result.replace("</head>", `${baseScript}\n  </head>`);
    result = result.replace(
      /(<(?:link|script|a|form)[^>]*(?:href|src|action)=")\/(?!\/)/g,
      `$1${BASE_PREFIX}/`,
    );
  }

  return result;
}

export function isFullDocument(html: string): boolean {
  const trimmed = html.trimStart().toLowerCase();
  return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html");
}

export async function getLayout(): Promise<string> {
  const themeLayout = await getThemeHtml("layout");
  if (themeLayout) return themeLayout;
  return Bun.file(`${DEFAULT_THEME_DIR}/layout.html`).text();
}

export async function buildLayoutPage(
  pageName: string,
  locale?: string,
  bodyClass?: string,
): Promise<string> {
  const layout = await getLayout();
  const pageContent = await Bun.file(`${DEFAULT_THEME_DIR}/${pageName}`).text();
  const html = layout
    .replace("__PAGE_CONTENT__", pageContent)
    .replace("__BODY_CLASS__", bodyClass ? `class="${bodyClass}"` : "");
  const t = await getTranslator(locale);
  return applyPagePlaceholders(html, t, locale);
}

export async function buildThemedLayoutPage(
  themePageHtml: string,
  locale?: string,
  bodyClass?: string,
): Promise<string> {
  const layout = await getLayout();
  const html = layout
    .replace("__PAGE_CONTENT__", themePageHtml)
    .replace("__BODY_CLASS__", bodyClass ? `class="${bodyClass}"` : "");
  const t = await getTranslator(locale, true);
  return applyPagePlaceholders(html, t, locale);
}

const _apiKeySection = `<code id="settings-api-key-value" class="settings-toggle-label"></code>
  <div>
    <button type="button" id="settings-api-key-reveal" class="btn btn--secondary degoog-btn degoog-btn--secondary" aria-label="{{t:settings-page.server.api-key-reveal}}"><i class="fa-solid fa-eye fa-lg"></i></button>
    <button type="button" id="settings-api-key-copy" class="btn btn--secondary degoog-btn degoog-btn--secondary" aria-label="{{t:settings-page.server.api-key-copy}}"><i class="fa-solid fa-copy fa-lg"></i></button>
    <button type="button" id="settings-api-key-regenerate" class="btn btn--secondary degoog-btn degoog-btn--secondary" aria-label="{{t:settings-page.server.api-key-regenerate}}"><i class="fa-solid fa-rotate-right fa-lg"></i></button>
  </div>`;

const _apiKeySectionLocked = `<p class="settings-desc">{{t:settings-page.server.api-key-no-password}}</p>`;

export async function buildPage(
  filename: string,
  locale?: string,
): Promise<string> {
  let html = await Bun.file(`src/public/${filename}`).text();
  if (html.includes("__API_KEY_SECTION__")) {
    const content = isPasswordRequired()
      ? _apiKeySection
      : _apiKeySectionLocked;
    html = html.replace("__API_KEY_SECTION__", content);
  }
  if (html.includes("__SETTINGS_NAV__")) {
    html = html.replace("__SETTINGS_NAV__", buildSettingsNav());
  }
  if (html.includes("__SETTINGS_TAB_SELECT__")) {
    html = html.replace("__SETTINGS_TAB_SELECT__", buildSettingsTabSelect());
  }
  const t = await getTranslator(locale);
  return applyPagePlaceholders(html, t, locale);
}
