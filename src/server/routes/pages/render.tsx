import { readFile } from "fs/promises";
import { join } from "path";
import pkg from "../../../../package.json";
import { getAllCommandTranslators } from "../../extensions/commands/registry";
import { getAllEngineTranslators } from "../../extensions/engines/loader";
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
import type { Translate } from "../../types/extension";
import {
  getAllPluginCss,
  getPluginScriptFolders,
  getPluginSettingsIds,
} from "../../utils/extension-support/plugin-assets";
import { asBoolean, asString, isDisabled } from "../../utils/settings/plugin-settings";
import {
  DEFAULT_ENGINE_ORIGIN_DISPLAY,
  isOriginDisplay,
} from "../../../shared/engine-origins";
import {
  compileLexicons,
  syncVortexSignal,
  withBuffer,
} from "../../utils/extension-support/translation-circuit";
import { mintToken } from "../../utils/security/link-token";
import { cssCheckOn } from "../../utils/security/bot-trap";
import { logger } from "../../utils/logger";
import { generateSearchNonce } from "../../utils/security/search-nonce";
import { getInstanceSettings } from "../../utils/settings/server-settings";
import { readShortcutsSettings } from "../../utils/settings/shortcuts-settings";
import { getClientShortcuts } from "../../extensions/shortcuts/registry";
import { isPasswordRequired } from "../settings/settings-auth";
import { readSyncedDefaults } from "../../utils/settings/synced-settings";
import { buildSettingsNav, buildSettingsTabSelect } from "./settings-nav";
import { renderHtml } from "../../../shared/ui/tribute/html";
import { ThemeTemplate } from "../../../shared/ui/components/layout/theme-template";
import {
  DEFAULT_THEME_DIR,
  basePrefix,
  customCssTag,
  getCoreTranslator,
  getDefaultThemeTranslator,
  textDirection,
  themeCssLink,
} from "../../render/theme-assets";
import { ApiKeyLocked } from "./api-key-locked";
import { ApiKeySection } from "./api-key-section";

const BASE_PREFIX = basePrefix();


interface DefaultThemeManifest {
  templates?: Record<string, string>;
}

let defaultManifestCache: DefaultThemeManifest | null = null;

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
    parts.push(renderHtml(<ThemeTemplate id={id} content={content} />));
  }
  return parts.join("\n");
}

export async function getTranslator(
  _locale?: string,
  themed = false,
): Promise<Translate> {
  const baseT = await getDefaultThemeTranslator();
  const theme = await getActiveTheme();
  const themeChain = themed && theme?.t ? withBuffer(theme.t, baseT) : baseT;
  const coreT = await getCoreTranslator();
  return withBuffer(themeChain, coreT);
}

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
  const theme = await getActiveTheme();

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
    .replace("__THEME_CSS__", await themeCssLink())
    .replace("__THEME_ATTRS__", themeAttrs)
    .replace("__PLUGIN_ASSETS__", await pluginAssetsPlaceholder())
    .replace("__CUSTOM_CSS__", await customCssTag())
    .replace("__RTL_SUPPORT__", `dir=${textDirection(resolvedLocale)}`);
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

  const rawOriginDisplay = asString(pageSettings.engineOriginDisplay);
  const originDisplay = isOriginDisplay(rawOriginDisplay)
    ? rawOriginDisplay
    : DEFAULT_ENGINE_ORIGIN_DISPLAY;
  const originScript = `<script>window.__DEGOOG_ENGINE_ORIGINS__=${JSON.stringify(originDisplay)}</script>`;
  result = result.replace("</head>", `${originScript}\n  </head>`);

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

export async function buildPage(
  filename: string,
  locale?: string,
): Promise<string> {
  let html = await Bun.file(`src/public/${filename}`).text();
  if (html.includes("__API_KEY_SECTION__")) {
    const content = isPasswordRequired()
      ? renderHtml(<ApiKeySection />)
      : renderHtml(<ApiKeyLocked />);
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
