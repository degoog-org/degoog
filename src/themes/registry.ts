import { readdir, readFile, mkdir } from "fs/promises";
import { join } from "path";
import * as sass from "sass";
import { getSettings, setSettings, maskSecrets, mergeSecrets } from "../plugin-settings";
import { debug } from "../logger";
import type { SettingField, ExtensionMeta } from "../types";

const THEME_SETTINGS_ID = "theme";

export interface ThemeManifest {
  name: string;
  author?: string;
  description?: string;
  version?: string;
  css?: string;
  js?: string;
  settingsSchema?: SettingField[];
  html?: {
    index?: string;
    search?: string;
    settings?: string;
  };
}

export interface LoadedTheme {
  id: string;
  manifest: ThemeManifest;
  dir: string;
  compiledCss?: string;
}

const THEMES_DIR =
  process.env.DEGOOG_THEMES_DIR ?? join(process.cwd(), "data", "themes");

let themes: LoadedTheme[] = [];
let activeThemeId: string | null = null;

function settingsId(themeId: string): string {
  return `theme-${themeId}`;
}

async function compileThemeCss(theme: LoadedTheme): Promise<string | undefined> {
  const cssFile = theme.manifest.css;
  if (!cssFile) return undefined;

  const fullPath = join(theme.dir, cssFile);
  try {
    if (cssFile.endsWith(".scss")) {
      const result = sass.compile(fullPath);
      return result.css;
    }
    return await readFile(fullPath, "utf-8");
  } catch (err) {
    debug("themes", `Failed to compile CSS for theme ${theme.id}`, err);
    return undefined;
  }
}

async function loadActiveThemeId(): Promise<string | null> {
  const theme = await getSettings(THEME_SETTINGS_ID);
  const active = theme.active?.trim();
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
          debug("themes", `Theme ${entry.name} missing name in theme.json`);
          continue;
        }

        const theme: LoadedTheme = {
          id: entry.name,
          manifest,
          dir: themeDir,
        };

        theme.compiledCss = await compileThemeCss(theme);

        if (manifest.settingsSchema?.length) {
          const stored = await getSettings(settingsId(entry.name));
          if (Object.keys(stored).length > 0) {
            // themes don't have configure() but settings are available via API
          }
        }

        themes.push(theme);
      } catch (err) {
        debug("themes", `Failed to load theme: ${entry.name}`, err);
      }
    }
  } catch (err) {
    debug("themes", "Failed to read themes directory", err);
  }

  activeThemeId = await loadActiveThemeId();

  // clear active if theme no longer exists
  if (activeThemeId && !themes.find((t) => t.id === activeThemeId)) {
    activeThemeId = null;
    await saveActiveThemeId(null);
  }

  const names = themes.map((t) => t.id);
  if (names.length > 0) {
    console.log(`  themes: ${names.join(", ")}`);
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
  page: "index" | "search" | "settings",
): Promise<string | null> {
  const theme = getActiveTheme();
  if (!theme) return null;
  const htmlFile = theme.manifest.html?.[page];
  if (!htmlFile) return null;

  try {
    return await readFile(join(theme.dir, htmlFile), "utf-8");
  } catch {
    return null;
  }
}

export async function getThemeExtensionMeta(): Promise<ExtensionMeta[]> {
  const results: ExtensionMeta[] = [];

  for (const theme of themes) {
    const schema = theme.manifest.settingsSchema ?? [];
    const rawSettings = schema.length > 0 ? await getSettings(settingsId(theme.id)) : {};
    const maskedSettings = maskSecrets(rawSettings, schema);

    results.push({
      id: settingsId(theme.id),
      displayName: theme.manifest.name,
      description: theme.manifest.description ?? "Custom theme",
      type: "theme",
      configurable: schema.length > 0,
      settingsSchema: schema,
      settings: maskedSettings,
    });
  }

  return results;
}

export async function recompileTheme(id: string): Promise<void> {
  const theme = themes.find((t) => t.id === id);
  if (theme) {
    theme.compiledCss = await compileThemeCss(theme);
  }
}
