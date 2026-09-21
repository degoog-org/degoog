import { access, readFile, readdir } from "fs/promises";
import { join } from "path";
import {
  getActiveTheme,
  getThemeGeneration,
  type ThemeManifest,
} from "../extensions/themes/registry";
import { rewriteThemePaths } from "../utils/extension-id";
import { logger } from "../utils/logger";
import { sanitizeTemplate } from "./dom";

const DEFAULT_THEME_DIR = "src/public/themes/degoog-theme";
const DEFAULT_NOJS_DIR = `${DEFAULT_THEME_DIR}/nojs`;
const NOJS_DIR_NAME = "nojs";
const SAFE_NAME_RE = /^[\w-]+$/;
const HTML_SUFFIX = ".html";

export const NOJS_TEMPLATE_NAMES = [
  "layout",
  "index",
  "search",
  "home-header",
  "home-search",
  "home-footer",
  "search-header",
  "result",
  "image-card",
  "logo",
  "tabs",
  "pagination",
] as const;

const KNOWN_FILES = new Set(
  NOJS_TEMPLATE_NAMES.map((name) => `${name}${HTML_SUFFIX}`),
);

const auditedThemes = new Set<string>();
const resolved = new Map<string, string | null>();

let defaultManifest: ThemeManifest | null = null;
let cachedGeneration = -1;
let cachedTheme: string | null = null;

const _exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const _auditOverrides = async (dir: string, themeId: string): Promise<void> => {
  if (auditedThemes.has(themeId)) return;
  auditedThemes.add(themeId);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  const strays = entries.filter(
    (entry) => entry.endsWith(HTML_SUFFIX) && !KNOWN_FILES.has(entry),
  );
  if (strays.length === 0) return;
  logger.warn(
    "nojs",
    `theme ${themeId} ships nojs templates that degoog never loads: ${strays.join(", ")}. ` +
      `Overrides are matched by exact filename, one of ${NOJS_TEMPLATE_NAMES.join(", ")} with a ${HTML_SUFFIX} suffix.`,
  );
};

const _readOverride = async (
  path: string,
  themeId: string,
  fileName: string,
): Promise<string | null> => {
  try {
    return rewriteThemePaths(await readFile(path, "utf-8"), themeId);
  } catch (err) {
    if (await _exists(path)) {
      logger.warn(
        "nojs",
        `theme ${themeId} has a nojs/${fileName} override that could not be read, falling back to the default template`,
        err,
      );
    } else {
      logger.debug("nojs", `theme ${themeId} has no nojs/${fileName} override`, err);
    }
    return null;
  }
};

const _manifestFile = (
  manifest: ThemeManifest | null,
  name: string,
): string | null =>
  manifest?.html?.[name as keyof NonNullable<ThemeManifest["html"]>] ??
  manifest?.templates?.[name] ??
  null;

const _readDefaultManifest = async (): Promise<ThemeManifest | null> => {
  if (defaultManifest) return defaultManifest;
  try {
    defaultManifest = JSON.parse(
      await readFile(join(DEFAULT_THEME_DIR, "theme.json"), "utf-8"),
    ) as ThemeManifest;
  } catch (err) {
    logger.error("nojs", "could not read the default theme manifest", err);
    defaultManifest = null;
  }
  return defaultManifest;
};

const _readInherited = async (
  dir: string,
  file: string,
  themeId: string | null,
  name: string,
): Promise<string | null> => {
  try {
    const raw = await readFile(join(dir, file), "utf-8");
    return themeId ? rewriteThemePaths(raw, themeId) : raw;
  } catch (err) {
    logger.debug(
      "nojs",
      `could not inherit the normal template for ${name} from ${dir}`,
      err,
    );
    return null;
  }
};

const _resolve = async (name: string): Promise<string | null> => {
  const fileName = `${name}${HTML_SUFFIX}`;

  const theme = await getActiveTheme();
  if (theme) {
    const dir = join(theme.dir, NOJS_DIR_NAME);
    await _auditOverrides(dir, theme.id);
    const override = await _readOverride(join(dir, fileName), theme.id, fileName);
    if (override !== null) return override;
  }

  try {
    return await readFile(join(DEFAULT_NOJS_DIR, fileName), "utf-8");
  } catch (err) {
    logger.debug("nojs", `no default nojs override for ${fileName}`, err);
  }

  if (theme) {
    const file = _manifestFile(theme.manifest, name);
    if (file) {
      const inherited = await _readInherited(theme.dir, file, theme.id, name);
      if (inherited !== null) return inherited;
    }
  }

  const file = _manifestFile(await _readDefaultManifest(), name);
  if (!file) {
    logger.error("nojs", `no template is registered for the nojs name: ${name}`);
    return null;
  }
  const inherited = await _readInherited(DEFAULT_THEME_DIR, file, null, name);
  if (inherited === null) {
    logger.error("nojs", `Failed to read default nojs template: ${fileName}`);
  }
  return inherited;
};

function _syncCache(themeId: string): void {
  const generation = getThemeGeneration();
  if (cachedGeneration === generation && cachedTheme === themeId) return;
  cachedGeneration = generation;
  cachedTheme = themeId;
  resolved.clear();
}

export const loadNojsTemplate = async (
  name: string,
): Promise<string | null> => {
  if (!SAFE_NAME_RE.test(name)) return null;

  const theme = await getActiveTheme();
  _syncCache(theme?.id ?? "");

  const hit = resolved.get(name);
  if (hit !== undefined) return hit;

  const html = await _resolve(name);
  const template = html === null ? null : sanitizeTemplate(html);
  resolved.set(name, template);
  return template;
};
