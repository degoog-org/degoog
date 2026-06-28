import { mkdir, readdir, readFile } from "fs/promises";
import { join } from "path";
import {
  type ExtensionMeta,
  ExtensionStoreType,
  type SettingField,
  Translate,
} from "../../types";
import { logger } from "../../utils/logger";
import {
  asString,
  getSettings,
  setSettings,
} from "../../utils/plugin-settings";

const THEME_SETTINGS_ID = "theme";

export interface ThemeManifest {
  name: string;
  author?: string;
  description?: string;
  version?: string;
  css?: string;
  js?: string;
  settingsSchema?: SettingField[];
  dataAttrsFromSettings?: Record<string, string>;
  html?: {
    layout?: string;
    index?: string;
    search?: string;
    settings?: string;
    gandalf?: string;
    "robots-takeover"?: string;
    "404"?: string;
  };
  templates?: Record<string, string>;
}

export interface LoadedTheme {
  id: string;
  manifest: ThemeManifest;
  dir: string;
  compiledCss?: string;
  t?: Translate;
}

import { themesDir } from "../../utils/paths";
import { bootCircuitFromPath } from "../../utils/translation-circuit";
import { buildExtensionMeta } from "../extension-meta";
import { makeExtID, rewriteThemePaths } from "../../utils/extension-id";

const THEMES_DIR = themesDir();

let themes: LoadedTheme[] = [];
let activeThemeId: string | null = null;

export function getThemeSettingsId(themeId: string): string {
  return makeExtID(themeId, "theme");
}

async function compileThemeCss(
  theme: LoadedTheme,
): Promise<string | undefined> {
  const cssFile = theme.manifest.css;
  if (!cssFile) return undefined;

  const fullPath = join(theme.dir, cssFile);
  try {
    return rewriteThemePaths(await readFile(fullPath, "utf-8"), theme.id);
  } catch (err) {
    logger.debug("themes", `Failed to compile CSS for theme ${theme.id}`, err);
    return undefined;
  }
}

async function loadActiveThemeId(): Promise<string | null> {
  const theme = await getSettings(THEME_SETTINGS_ID);
  const active = asString(theme.active).trim();
  return active || null;
}

async function saveActiveThemeId(id: string | null): Promise<void> {
  await setSettings(THEME_SETTINGS_ID, { active: id ?? "" });
}

export async function initThemes(): Promise<void> {
  themes = [];

  try {
    await mkdir(THEMES_DIR, { recursive: true });
    const entries = await readdir(THEMES_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const themeDir = join(THEMES_DIR, entry.name);
      const manifestPath = join(themeDir, "theme.json");

      try {
        const raw = await readFile(manifestPath, "utf-8");
        const manifest: ThemeManifest = JSON.parse(raw);

        if (!manifest.name) {
          logger.debug(
            "themes",
            `Theme ${entry.name} missing name in theme.json`,
          );
          continue;
        }

        const theme: LoadedTheme = {
          id: entry.name,
          manifest,
          dir: themeDir,
        };

        theme.compiledCss = await compileThemeCss(theme);
        theme.t = await bootCircuitFromPath(themeDir);

        themes.push(theme);
      } catch (err) {
        logger.debug("themes", `Failed to load theme: ${entry.name}`, err);
      }
    }
  } catch (err) {
    logger.debug("themes", "Failed to read themes directory", err);
  }

  activeThemeId = await loadActiveThemeId();

  if (activeThemeId && !themes.find((t) => t.id === activeThemeId)) {
    activeThemeId = null;
    await saveActiveThemeId(null);
  }
}

export function getThemes(): LoadedTheme[] {
  return themes;
}

export function getActiveTheme(): LoadedTheme | null {
  if (!activeThemeId) return null;
  return themes.find((t) => t.id === activeThemeId) ?? null;
}

export function getActiveThemeId(): string | null {
  return activeThemeId;
}

export async function setActiveTheme(id: string | null): Promise<boolean> {
  if (id !== null && !themes.find((t) => t.id === id)) return false;
  activeThemeId = id;
  await saveActiveThemeId(id);
  return true;
}

export function getThemeById(id: string): LoadedTheme | null {
  return themes.find((t) => t.id === id) ?? null;
}

export async function getThemeHtml(
  page:
    | "layout"
    | "index"
    | "search"
    | "settings"
    | "gandalf"
    | "robots-takeover"
    | "404",
): Promise<string | null> {
  const theme = getActiveTheme();
  if (!theme) return null;
  const htmlFile = theme.manifest.html?.[page];
  if (!htmlFile) return null;

  try {
    return rewriteThemePaths(
      await readFile(join(theme.dir, htmlFile), "utf-8"),
      theme.id,
    );
  } catch (err) {
    logger.debug("themes", `Failed to read theme HTML for page ${page}`, err);
    return null;
  }
}

export async function getThemeExtensionMeta(): Promise<ExtensionMeta[]> {
  const results: ExtensionMeta[] = [];

  for (const theme of themes) {
    const schema = theme.manifest.settingsSchema ?? [];
    const id = getThemeSettingsId(theme.id);
    results.push(
      await buildExtensionMeta({
        id,
        displayName: theme.manifest.name,
        description: theme.manifest.description ?? "Custom theme",
        type: ExtensionStoreType.Theme,
        schema,
        rawSettings: schema.length > 0 ? await getSettings(id) : {},
      }),
    );
  }

  return results;
}

export async function getActiveThemeDataAttrsMap(): Promise<
  Record<string, string>
> {
  const theme = getActiveTheme();
  if (
    !theme?.manifest.dataAttrsFromSettings ||
    Object.keys(theme.manifest.dataAttrsFromSettings).length === 0
  ) {
    return {};
  }
  const stored = await getSettings(getThemeSettingsId(theme.id));
  const attrs: Record<string, string> = {};
  for (const [settingKey, attrSuffix] of Object.entries(
    theme.manifest.dataAttrsFromSettings,
  )) {
    let value = stored[settingKey];
    if (value == null || String(value).trim() === "") {
      const field = theme.manifest.settingsSchema?.find(
        (f) => f.key === settingKey,
      );
      if (field?.type === "select" && field.options?.length)
        value = field.options[0];
      if (value == null || String(value).trim() === "") continue;
    }
    const attrName = attrSuffix.startsWith("data-")
      ? attrSuffix
      : `data-${attrSuffix}`;
    attrs[attrName] = String(value).trim();
  }
  return attrs;
}

export async function getActiveThemeDataAttrs(): Promise<string> {
  const attrs = await getActiveThemeDataAttrsMap();
  const parts = Object.entries(attrs).map(
    ([name, value]) => `${name}="${value.replace(/"/g, "&quot;")}"`,
  );
  return parts.length > 0 ? " " + parts.join(" ") : "";
}

export async function getThemeTemplatesHtml(): Promise<string> {
  const theme = getActiveTheme();
  if (!theme?.manifest.templates) return "";
  const parts: string[] = [];
  for (const [id, filePath] of Object.entries(theme.manifest.templates)) {
    try {
      const content = rewriteThemePaths(
        await readFile(join(theme.dir, filePath), "utf-8"),
        theme.id,
      );
      parts.push(`<template id="degoog-${id}">${content}</template>`);
    } catch (err) {
      logger.debug(
        "themes",
        `Failed to read template file: ${filePath} for theme ${theme.id}`,
        err,
      );
    }
  }
  return parts.join("\n");
}

export async function recompileTheme(id: string): Promise<void> {
  const theme = themes.find((t) => t.id === id);
  if (theme) {
    theme.compiledCss = await compileThemeCss(theme);
  }
}

export async function reloadThemes(_bust = true): Promise<void> {
  themes = [];
  activeThemeId = null;
  await initThemes();
}
