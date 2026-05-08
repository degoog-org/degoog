import { readFile } from "fs/promises";
import { Context, Hono } from "hono";
import { join } from "path";
import pkg from "../../../package.json";
import { SETTINGS_TABS } from "../../shared/settings-tabs";
import { getAllCommandTranslators } from "../extensions/commands/registry";
import {
  getAllEngineTranslators,
  getDefaultEngineConfig,
  getEngineRegistry,
} from "../extensions/engines/registry";
import { getAllMiddlewareTranslators } from "../extensions/middleware/registry";
import { getAllSearchBarTranslators } from "../extensions/search-bar/registry";
import { getAllTabTranslators } from "../extensions/search-result-tabs/registry";
import { getAllSlotTranslators } from "../extensions/slots/registry";
import {
  getActiveTheme,
  getActiveThemeDataAttrs,
  getThemeHtml,
  getThemeTemplatesHtml,
} from "../extensions/themes/registry";
import { Translate } from "../types";
import * as cache from "../utils/cache";
import { getLocale } from "../utils/hono";
import {
  getAllPluginCss,
  getPluginScriptFolders,
  getPluginSettingsIds,
} from "../utils/plugin-assets";
import { asString, getSettings, isDisabled } from "../utils/plugin-settings";
import { isPublicInstance } from "../utils/public-instance";
import {
  collectTranslationsForLocale,
  createTranslatorFromPath,
  translateHTML,
  withFallback,
} from "../utils/translation";
import {
  getSettingsTokenFromRequest,
  isPasswordRequired,
  shouldServeSettingsGate,
  validateSettingsToken,
} from "./settings-auth";
import { generateSearchNonce } from "../utils/search-nonce";
import { getBasePath, getBaseUrl } from "../utils/base-url";

const DEFAULT_THEME_DIR = "src/public/themes/degoog-theme";
const CORE_LOCALES_ROOT = "src";
const BASE_URL = getBaseUrl();
const BASE_PATH = getBasePath();
const BASE_PREFIX = BASE_PATH || (BASE_URL && !/^https?:\/\//i.test(BASE_URL) ? BASE_URL : "");

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
    defaultThemeTranslator = await createTranslatorFromPath(DEFAULT_THEME_DIR);
  }
  return defaultThemeTranslator;
}

export async function getCoreTranslator(): Promise<Translate> {
  if (!coreTranslator) {
    coreTranslator = await createTranslatorFromPath(CORE_LOCALES_ROOT);
  }
  return coreTranslator;
}

async function getTranslator(
  locale?: string,
  themed = false,
): Promise<Translate> {
  const baseT = await getDefaultThemeTranslator();
  const theme = getActiveTheme();
  const themeChain = themed && theme?.t ? withFallback(theme.t, baseT) : baseT;
  const coreT = await getCoreTranslator();
  const t = withFallback(themeChain, coreT);
  if (locale) t.setLocale(locale);
  return t;
}

function getTextDirection(locale: string): "rtl" | "ltr" {
  const RTL_LANGS = ["ar", "he", "fa", "ur", "ps", "ckb"];
  const isRTL = RTL_LANGS.some((lang) => locale.toLowerCase().startsWith(lang));
  return isRTL ? "rtl" : "ltr";
}

const router = new Hono();

function buildOpenSearchXml(origin: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>degoog</ShortName>
  <Description>Search</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Image width="16" height="16" type="image/x-icon">${origin}/public/favicon/favicon.ico</Image>
  <Url type="text/html" template="${origin}/search?q={searchTerms}"/>
  <Url type="application/x-suggestions+json" template="${origin}/api/suggest/opensearch?q={searchTerms}"/>
</OpenSearchDescription>`;
}

function themeCssPlaceholder(): string {
  const theme = getActiveTheme();
  if (!theme?.manifest.css) return "";
  return `<link rel="stylesheet" href="/theme/style.css?v=${pkg.version}">`;
}

const _DEGOOG_SETTINGS_ID = "degoog-settings";

const customCssPlaceholder = async (): Promise<string> => {
  const settings = await getSettings(_DEGOOG_SETTINGS_ID);
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

async function applyPagePlaceholders(
  html: string,
  t: Translate,
): Promise<string> {
  const themeAttrs = await getActiveThemeDataAttrs();
  const locale = t.locale || "en";

  // Collect all translations for the current locale (namespaced)
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

  const clientTranslations = collectTranslationsForLocale(entries, locale);
  const safeJson = JSON.stringify(clientTranslations).replace(/<\//g, "<\\/");
  const translationsScript = `<script>window.__DEGOOG_T__=${safeJson}</script>\n  <script src="/public/t.js?v=${pkg.version}"></script>`;

  let result = html
    .replace("__THEME_CSS__", themeCssPlaceholder())
    .replace("__THEME_ATTRS__", themeAttrs)
    .replace("__PLUGIN_ASSETS__", await pluginAssetsPlaceholder())
    .replace("__CUSTOM_CSS__", await customCssPlaceholder())
    .replace("__RTL_SUPPORT__", `dir=${getTextDirection(locale)}`);
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

  const pageSettings = await getSettings(_DEGOOG_SETTINGS_ID);
  const anyApiKeyEnabled =
    asString(pageSettings.apiKeySearchEnabled) === "true" ||
    asString(pageSettings.apiKeySuggestEnabled) === "true";
  if (anyApiKeyEnabled) {
    const auth = generateSearchNonce();
    const nonceScript = `<script>window.__DEGOOG_SEARCH_AUTH__=${JSON.stringify(auth)}</script>`;
    result = result.replace("</head>", `${nonceScript}\n  </head>`);
  }

  result = result.replace("</head>", `${translationsScript}\n  </head>`);

  result = translateHTML(result, t);

  const acDebounceMs = parseInt(asString(pageSettings.acDebounceMs), 10);
  const acDebounce = Number.isFinite(acDebounceMs) && acDebounceMs >= 0 ? acDebounceMs : 150;
  const acScript = `<script>window.__DEGOOG_AC_DEBOUNCE__=${acDebounce}</script>`;
  result = result.replace("</head>", `${acScript}\n  </head>`);

  result = result.replace(
    "</head>",
    `<link rel="stylesheet" href="/public/icons/fontawesome/css/all.min.css?v=${pkg.version}">\n  </head>`,
  );

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

function isFullDocument(html: string): boolean {
  const trimmed = html.trimStart().toLowerCase();
  return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html");
}

async function getLayout(): Promise<string> {
  const themeLayout = await getThemeHtml("layout");
  if (themeLayout) return themeLayout;
  return Bun.file(`${DEFAULT_THEME_DIR}/layout.html`).text();
}

async function buildLayoutPage(
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
  return applyPagePlaceholders(html, t);
}

async function buildThemedLayoutPage(
  themePageHtml: string,
  locale?: string,
  bodyClass?: string,
): Promise<string> {
  const layout = await getLayout();
  const html = layout
    .replace("__PAGE_CONTENT__", themePageHtml)
    .replace("__BODY_CLASS__", bodyClass ? `class="${bodyClass}"` : "");
  const t = await getTranslator(locale, true);
  return applyPagePlaceholders(html, t);
}

const _apiKeySection = `<code id="settings-api-key-value" class="settings-toggle-label"></code>
  <div>
    <button type="button" id="settings-api-key-reveal" class="btn btn--secondary degoog-btn degoog-btn--secondary" aria-label="{{t:settings-page.server.api-key-reveal}}"><i class="fa-solid fa-eye fa-lg"></i></button>
    <button type="button" id="settings-api-key-copy" class="btn btn--secondary degoog-btn degoog-btn--secondary" aria-label="{{t:settings-page.server.api-key-copy}}"><i class="fa-solid fa-copy fa-lg"></i></button>
    <button type="button" id="settings-api-key-regenerate" class="btn btn--secondary degoog-btn degoog-btn--secondary" aria-label="{{t:settings-page.server.api-key-regenerate}}"><i class="fa-solid fa-rotate-right fa-lg"></i></button>
  </div>`;

const _apiKeySectionLocked = `<p class="settings-desc">{{t:settings-page.server.api-key-no-password}}</p>`;

async function buildPage(filename: string, locale?: string): Promise<string> {
  let html = await Bun.file(`src/public/${filename}`).text();
  if (html.includes("__API_KEY_SECTION__")) {
    const content = isPasswordRequired()
      ? _apiKeySection
      : _apiKeySectionLocked;
    html = html.replace("__API_KEY_SECTION__", content);
  }
  const t = await getTranslator(locale);
  return applyPagePlaceholders(html, t);
}

router.get("/", async (c) => {
  const q = c.req.query("q");
  if (q?.trim()) {
    const params = new URLSearchParams(c.req.url.split("?")[1] || "");
    return c.redirect(`${BASE_URL || BASE_PATH}/search?${params.toString()}`, 302);
  }
  const locale = getLocale(c);
  const override = await getThemeHtml("index");
  if (override) {
    if (isFullDocument(override)) {
      const t = await getTranslator(locale, true);
      return c.html(await applyPagePlaceholders(override, t));
    }
    return c.html(await buildThemedLayoutPage(override, locale));
  }
  return c.html(await buildLayoutPage("index.html", locale));
});

const _buildResultActionsScript = async (c: Context): Promise<string> => {
  const token = getSettingsTokenFromRequest(c);
  const authenticated = await validateSettingsToken(token);
  let blockUi = false;
  let replaceUi = false;
  let scoreUi = false;
  if (authenticated) {
    const settings = await getSettings("degoog-settings");
    blockUi = asString(settings.domainBlockUiEnabled) === "true";
    replaceUi = asString(settings.domainReplaceUiEnabled) === "true";
    scoreUi = asString(settings.domainScoreUiEnabled) === "true";
  }
  const payload = JSON.stringify({
    authenticated,
    blockUi,
    replaceUi,
    scoreUi,
  }).replace(/<\//g, "<\\/");
  return `<script>window.__DEGOOG_RESULT_ACTIONS__=${payload}</script>`;
};

const _injectIntoHead = (html: string, fragment: string): string => {
  if (html.includes("</head>")) {
    return html.replace("</head>", `${fragment}\n  </head>`);
  }
  return `${fragment}\n${html}`;
};

router.get("/search", async (c) => {
  const locale = getLocale(c);
  const override = await getThemeHtml("search");
  const actionsScript = await _buildResultActionsScript(c);
  let html: string;
  if (override) {
    if (isFullDocument(override)) {
      const t = await getTranslator(locale, true);
      html = await applyPagePlaceholders(override, t);
    } else {
      html = await buildThemedLayoutPage(override, locale, "has-results");
    }
  } else {
    html = await buildLayoutPage("search.html", locale, "has-results");
  }
  return c.html(_injectIntoHead(html, actionsScript));
});

router.get("/settings/", (c) => c.redirect(`${BASE_URL || BASE_PATH}/settings`, 301));
router.get("/settings", async (c) => {
  const locale = getLocale(c);
  if (isPublicInstance())
    return c.html(await buildPage("settings-public.html", locale));
  if (await shouldServeSettingsGate(c)) {
    return c.html(await buildPage("settings-gate.html", locale));
  }
  return c.html(await buildPage("settings.html", locale));
});

router.get("/settings/:tab", async (c) => {
  if (isPublicInstance()) return c.redirect(`${BASE_URL || BASE_PATH}/settings`, 302);
  const tab = c.req.param("tab");
  if (!(SETTINGS_TABS as readonly string[]).includes(tab)) {
    return c.redirect(`${BASE_URL || BASE_PATH}/settings`, 302);
  }
  const locale = getLocale(c);
  if (await shouldServeSettingsGate(c)) {
    return c.html(await buildPage("settings-gate.html", locale));
  }
  return c.html(await buildPage("settings.html", locale));
});

router.get("/api/engines", (c) => {
  return c.json({
    engines: getEngineRegistry(),
    defaults: getDefaultEngineConfig(),
  });
});

router.get("/opensearch.xml", (c) => {
  const proto =
    c.req.header("x-forwarded-proto") ||
    new URL(c.req.url).protocol.replace(":", "");
  const host =
    c.req.header("x-forwarded-host") ||
    c.req.header("host") ||
    new URL(c.req.url).host;
  const basePath = BASE_URL
    ? (() => {
        try {
          return new URL(BASE_URL).pathname.replace(/\/+$/, "");
        } catch {
          return BASE_URL;
        }
      })()
    : "";
  return c.body(buildOpenSearchXml(`${proto}://${host}${basePath}`), 200, {
    "Content-Type": "application/opensearchdescription+xml; charset=utf-8",
  });
});

router.post("/api/cache/clear", async (c) => {
  const token = getSettingsTokenFromRequest(c);
  if (!(await validateSettingsToken(token)))
    return c.json({ error: "Unauthorized" }, 401);
  cache.clear();
  return c.json({ ok: true });
});

export default router;
