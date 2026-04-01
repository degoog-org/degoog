import { Hono } from "hono";
import * as cache from "../utils/cache";
import {
  getEngineRegistry,
  getDefaultEngineConfig,
} from "../extensions/engines/registry";
import { readFile } from "fs/promises";
import { join } from "path";
import {
  getThemeHtml,
  getActiveTheme,
  getActiveThemeDataAttrs,
  getThemeTemplatesHtml,
} from "../extensions/themes/registry";
import {
  getAllPluginCss,
  getPluginScriptFolders,
  getPluginSettingsIds,
} from "../utils/plugin-assets";
import { isDisabled } from "../utils/plugin-settings";
import {
  shouldServeSettingsGate,
  getSettingsTokenFromRequest,
  validateSettingsToken,
} from "./settings-auth";
import { isPublicInstance } from "../utils/public-instance";
import { SETTINGS_TABS } from "../../shared/settings-tabs";
import pkg from "../../../package.json";

const DEFAULT_THEME_DIR = "src/public/themes/degoog-theme";

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
    parts.push(`<template id="degoog-${id}">${content}</template>`);
  }
  return parts.join("\n");
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

async function applyPagePlaceholders(html: string): Promise<string> {
  const themeAttrs = await getActiveThemeDataAttrs();
  let result = html
    .replace("__THEME_CSS__", themeCssPlaceholder())
    .replace("__THEME_ATTRS__", themeAttrs)
    .replace("__PLUGIN_ASSETS__", await pluginAssetsPlaceholder());
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
  return result.replaceAll("__APP_VERSION__", pkg.version);
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
  bodyClass?: string,
): Promise<string> {
  const layout = await getLayout();
  const pageContent = await Bun.file(`${DEFAULT_THEME_DIR}/${pageName}`).text();
  const html = layout
    .replace("__PAGE_CONTENT__", pageContent)
    .replace("__BODY_CLASS__", bodyClass ? `class="${bodyClass}"` : "");
  return applyPagePlaceholders(html);
}

async function buildThemedLayoutPage(
  themePageHtml: string,
  bodyClass?: string,
): Promise<string> {
  const layout = await getLayout();
  const html = layout
    .replace("__PAGE_CONTENT__", themePageHtml)
    .replace("__BODY_CLASS__", bodyClass ? `class="${bodyClass}"` : "");
  return applyPagePlaceholders(html);
}

async function buildPage(filename: string): Promise<string> {
  const html = await Bun.file(`src/public/${filename}`).text();
  return applyPagePlaceholders(html);
}

router.get("/", async (c) => {
  const q = c.req.query("q");
  if (q?.trim()) {
    const params = new URLSearchParams(c.req.url.split("?")[1] || "");
    return c.redirect(`/search?${params.toString()}`, 302);
  }
  const override = await getThemeHtml("index");
  if (override) {
    if (isFullDocument(override)) {
      return c.html(await applyPagePlaceholders(override));
    }
    return c.html(await buildThemedLayoutPage(override));
  }
  return c.html(await buildLayoutPage("index.html"));
});

router.get("/search", async (c) => {
  const override = await getThemeHtml("search");
  if (override) {
    if (isFullDocument(override)) {
      return c.html(await applyPagePlaceholders(override));
    }
    return c.html(await buildThemedLayoutPage(override, "has-results"));
  }
  return c.html(await buildLayoutPage("search.html", "has-results"));
});

router.get("/settings/", (c) => c.redirect("/settings", 301));
router.get("/settings", async (c) => {
  if (isPublicInstance())
    return c.html(await buildPage("settings-public.html"));
  if (await shouldServeSettingsGate(c)) {
    return c.html(await buildPage("settings-gate.html"));
  }
  return c.html(await buildPage("settings.html"));
});

router.get("/settings/:tab", async (c) => {
  if (isPublicInstance()) return c.redirect("/settings", 302);
  const tab = c.req.param("tab");
  if (!(SETTINGS_TABS as readonly string[]).includes(tab)) {
    return c.redirect("/settings", 302);
  }
  if (await shouldServeSettingsGate(c)) {
    return c.html(await buildPage("settings-gate.html"));
  }
  return c.html(await buildPage("settings.html"));
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
  return c.body(buildOpenSearchXml(`${proto}://${host}`), 200, {
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
