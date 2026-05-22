/**
 * @fccview here.
 * If you are confused by this file, please do yourself a favour and watch the right tv shows.
 *
 * Info: https://tardis.fandom.com/wiki/Translation_circuit
 */

import { pathToFileURL } from "bun";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Translate, TranslationRecord, TranslationVars } from "../types";
import { logger } from "./logger";

const BASELINE_LANGS = ["en-us", "en-gb", "en"] as const;

const baseOf = (tag: string): string =>
  tag.split(";")[0].trim().split("-")[0].toLowerCase();

const tagOf = (tag: string): string => tag.split(";")[0].trim().toLowerCase();

const getBaseline = (langs: string[]): string | undefined => {
  const english = langs.filter((l) => baseOf(l) === "en");
  if (english.length === 0) return undefined;
  for (const pref of BASELINE_LANGS) {
    const hit = english.find((l) => l.toLowerCase() === pref);
    if (hit) return hit;
  }
  return english.slice().sort()[0];
};

const syncScore = (requested: string, candidate: string): number => {
  const reqTag = tagOf(requested);
  const reqBase = baseOf(requested);
  const candTag = tagOf(candidate);
  const candBase = baseOf(candidate);

  if (candTag === reqTag) return 300;
  if (candBase === reqBase) return 200;
  if (reqTag.startsWith(candBase) || candTag.startsWith(reqBase)) return 100;
  return 0;
};

/**
 * Queries the telepathic field to find the closest language match
 */
export const matchField = (
  lang: string,
  availableLangs: string[],
): string | null => {
  if (availableLangs.length === 0) return null;

  let best: { tag: string; score: number } | null = null;
  for (const candidate of availableLangs) {
    const score = syncScore(lang, candidate);
    if (score === 0) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score && candidate.localeCompare(best.tag) < 0)
    ) {
      best = { tag: candidate, score };
    }
  }
  if (best && best.score >= 200) return best.tag;

  const english = getBaseline(availableLangs);
  if (english) return english;

  logger.translation(
    "translation",
    `No exact match for "${lang}" and no English bundle available.`,
  );

  if (best) return best.tag;
  return availableLangs.slice().sort()[0];
};

/**
 * Imports raw language banks dynamically from local json files.
 */
export const loadBanks = async (path: string): Promise<TranslationRecord> => {
  const dir = join(path, "locales");
  const files = await readdir(dir).catch(() => {
    logger.translation(
      "translation",
      `No "locales" directory at "${path}". Skipping.`,
    );
    return [] as string[];
  });

  const translations: TranslationRecord = {};

  for (const file of files) {
    if (!file.endsWith(".json")) continue;

    const lang = file.slice(0, -5);
    const url = pathToFileURL(join(dir, file)).href;

    try {
      const mod = await import(url);
      const translation = mod.default ?? mod;

      if (typeof translation === "object" && translation !== null) {
        translations[lang] = translation;
      } else {
        logger.warn(
          "translation",
          `Translation "${lang}" at "${path}" does not export an object.`,
        );
      }
    } catch (e) {
      logger.translation(
        "translation",
        `Error loading "${lang}" at "${path}":`,
        e,
      );
    }
  }

  return translations;
};

const queryMatrix = (
  source: unknown,
  keys: string[],
): TranslationVars | undefined => {
  let cur: unknown = source;
  for (const k of keys) {
    if (typeof cur !== "object" || cur === null || !(k in cur))
      return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur as TranslationVars | undefined;
};

const hydrateVars = (
  template: string,
  vars: TranslationVars[] | Record<string, TranslationVars>,
): string => {
  if (Array.isArray(vars)) {
    let i = 0;
    return template.replace(/\{[^}]+\}/g, () => String(vars[i++]));
  }
  return template.replace(/\{([^}]+)\}/g, (match, name) =>
    name in vars ? String(vars[name as string]) : match,
  );
};

/**
 * Boots up the active translation circuit hook and returns a translator function.
 */
export const bootCircuit = (
  translations: TranslationRecord,
  defaultLocale = "en",
): Translate => {
  const langs = Object.keys(translations);

  const t = ((key, vars, locale) => {
    const requested = locale ?? t.defaultLocale;
    const primary = matchField(requested, langs);
    if (!primary) {
      logger.translation(
        "translation",
        `No translations available (requested "${requested}").`,
      );
      return key;
    }

    const keys = key.split(".");
    let value = queryMatrix(translations[primary], keys);

    if (value === undefined || typeof value === "object") {
      const fallback = matchField(
        "en",
        langs.filter((l) => l !== primary),
      );
      if (fallback) value = queryMatrix(translations[fallback], keys);
    }

    if (value === undefined || typeof value === "object") {
      logger.translation(
        "translation",
        `Missing translation for "${key}" (locale "${requested}").`,
      );
      return key;
    }

    if (typeof value !== "string" || !vars) return String(value);
    return hydrateVars(value, vars);
  }) as Translate;

  t.translations = translations;
  t.defaultLocale = defaultLocale;
  return t;
};

/**
 * Syntactic sugar to boot the circuit from a direct folder path.
 */
export const bootCircuitFromPath = async (
  path: string,
  defaultLocale = "en",
): Promise<Translate> => {
  const translations = await loadBanks(path);
  return bootCircuit(translations, defaultLocale);
};

/**
 * Adds a fallback language buffer layer if the main circuit hits a glitch.
 */
export const withBuffer = (
  primary: Translate,
  fallback: Translate,
): Translate => {
  const t = ((key, vars, locale) => {
    const result = primary(key, vars, locale);
    if (result === key) return fallback(key, vars, locale);
    return result;
  }) as Translate;

  t.translations = primary.translations;
  t.defaultLocale = primary.defaultLocale;
  return t;
};

/**
 * Processes the HTML stream, handles text, and preserves raw structural tags.
 */
export const syncVortexSignal = (
  html: string,
  t: Translate,
  locale?: string,
): string => {
  const blocks: string[] = [];
  const stripped = html.replace(
    /<(script|style|code|pre)[\s\S]*?<\/\1>/gi,
    (match) => {
      blocks.push(match);
      return `__IGNORE_BLOCK_${blocks.length - 1}__`;
    },
  );

  const translated = stripped.replace(
    /\{\{\s*t:([^}]+?)\s*\}\}/g,
    (_, content: string) => {
      const [key, ...vars] = content.split(",").map((p) => p.trim());
      if (vars.length === 0) return String(t(key, undefined, locale));

      const namedVars: Record<string, string> = {};
      for (const v of vars) namedVars[v] = `{{ ${v} }}`;
      return String(t(key, namedVars, locale));
    },
  );

  return translated.replace(
    /__IGNORE_BLOCK_(\d+)__/g,
    (_, i) => blocks[Number(i)],
  );
};

function fuseMatrices(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];

    if (
      typeof sv === "object" &&
      sv !== null &&
      typeof tv === "object" &&
      tv !== null
    ) {
      fuseMatrices(
        tv as Record<string, unknown>,
        sv as Record<string, unknown>,
      );
    } else {
      target[key] = sv;
    }
  }
  return target;
}

/**
 * Gathers regional lexicons into a unified dictionary matrix.
 */
export const compileLexicons = (
  entries: { namespace: string; translator: Translate }[],
  locale: string,
): Record<string, Record<string, TranslationRecord>> => {
  const result: Record<string, Record<string, TranslationRecord>> = {};

  for (const { namespace, translator } of entries) {
    const translations = translator.translations;
    if (!translations) continue;

    const langs = Object.keys(translations);
    const primary = matchField(locale, langs);
    if (!primary) continue;

    if (!result[namespace]) result[namespace] = {};

    const fallback = matchField(
      "en",
      langs.filter((l) => l !== primary),
    );
    if (fallback) {
      const src = translations[fallback];
      if (src && typeof src === "object") {
        fuseMatrices(
          result[namespace],
          src as Record<string, TranslationRecord>,
        );
      }
    }

    const src = translations[primary];
    if (src && typeof src === "object") {
      fuseMatrices(result[namespace], src as Record<string, TranslationRecord>);
    }
  }

  return result;
};

/**
 * Uses a perception filter boundary to scope script namespaces safely.
 */
export const applyFilter = (html: string, namespace: string): string => {
  const ns = JSON.stringify(namespace);
  return html.replace(
    /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (_, open, body, close) =>
      `${open}(function(t){${body}\n})(typeof window.scopedT==="function"?window.scopedT(${ns}):function(k){return k});${close}`,
  );
};
