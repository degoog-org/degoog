import { pathToFileURL } from "bun";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Translate, TranslationRecord, TranslationVars } from "../types";
import { debug } from "./logger";

/**
 * Returns the closest available language based on the provided language and available languages.
 * @param lang The desired language (e.g., "en-US").
 * @param availableLangs An array of available languages (e.g., ["en", "en-GB", "fr"]).
 * @returns The closest matching language from the available languages, or "en" if no match is found.
 */
export const getClosestLanguage = (
  lang: string,
  availableLangs: string[],
): string | null => {
  if (availableLangs.length === 0) return null;

  if (availableLangs.includes(lang)) return lang;

  const baseLang = lang.split("-")[0];

  const baseMatch = availableLangs.find((l) => l.split("-")[0] === baseLang);
  if (baseMatch) return baseMatch;

  debug(
    "translation",
    `No exact match for language "${lang}" or its base language "${baseLang}".`,
  );

  const firstAvailableEn = availableLangs.find((l) => l.startsWith("en"));
  return firstAvailableEn ? firstAvailableEn : availableLangs[0] || null;
};

/**
 * Dynamically imports all translation files from an extension path.
 * @param path The directory path where translation files are located.
 * @returns A promise that resolves to the translation record object, or an empty object if an error occurs.
 */
export const dynamicImportTranslationFiles = async (
  path: string,
): Promise<TranslationRecord> => {
  const files = await readdir(join(path, "locales")).catch((e) => {
    debug(
      "translation",
      `Error reading translation directory at path "${path}":`,
      e,
    );
    return [];
  });

  const translations: TranslationRecord = {};

  for (const file of files) {
    if (!file.endsWith(".json")) continue;

    const lang = file.substring(0, file.length - 5);
    const url = pathToFileURL(join(path, "locales", file)).href;

    try {
      const mod = await import(url);
      const translation = mod.default || mod;

      if (typeof translation === "object" && translation !== null) {
        translations[lang] = translation;
      } else {
        debug(
          "translation",
          `Translation file for language "${lang}" at path "${path}" does not export an object.`,
        );
      }
    } catch (e) {
      debug(
        "translation",
        `Error loading translation file for language "${lang}" at path "${path}":`,
        e,
      );
    }
  }

  return translations;
};

/**
 * Creates a translator function with the provided translations and locale management.
 * @param translations An object containing translations for multiple languages.
 * @returns A translator function that can be used to retrieve translations based on keys and variables, along with methods to manage locale and access translations.
 */
export const createTranslator = (translations: TranslationRecord) => {
  let locale = "en";

  return Object.assign(
    function (
      key: string,
      vars?: TranslationVars[] | Record<string, TranslationVars>,
    ) {
      const localeList = Object.keys(translations);
      const closestLang = getClosestLanguage(locale, localeList);

      if (!closestLang) {
        debug(
          "translation",
          `No available translations for locale "${locale}". Available languages: ${localeList.join(
            ", ",
          )}`,
        );
        return key;
      }

      // Split the keys and reduce translation object to find the value
      // If this isn't readable enough tell me, i'll use for loop c:
      const keys = key.split(".");
      const value = keys.reduce<
        TranslationVars | TranslationRecord | undefined
      >((acc, k) => {
        if (typeof acc === "object" && acc !== null && k in acc) return acc[k];
        return undefined;
      }, translations[closestLang]);

      if (typeof value === "object" || typeof value === "undefined") {
        debug(
          "translation",
          `Translation for key "${key}" in language "${locale}" is missing.`,
        );
        return key;
      }

      if (typeof value !== "string" || !vars) return String(value);

      if (Array.isArray(vars)) {
        let i = 0;
        return value.replace(/\{[^}]+\}/g, () => String(vars[i++]));
      } else {
        return value.replace(/\{([^}]+)\}/g, (match, p1) =>
          p1 in vars ? String(vars[p1]) : match,
        );
      }
    },
    {
      setLocale: function (newLocale: string) {
        locale = newLocale;
      },
      get locale() {
        return locale;
      },
      get translations() {
        return translations;
      },
    },
  );
};

export const createTranslatorFromPath = async (path: string) => {
  const translations = await dynamicImportTranslationFiles(path);
  return createTranslator(translations);
};

export const withFallback = (
  primary: Translate,
  fallback: Translate,
): Translate => {
  return Object.assign(
    function (
      key: string,
      vars?: TranslationVars[] | Record<string, TranslationVars>,
    ) {
      const result = primary(key, vars);
      if (result === key) return fallback(key, vars);
      return result;
    },
    {
      setLocale: function (newLocale: string) {
        primary.setLocale(newLocale);
        fallback.setLocale(newLocale);
      },
      get locale() {
        return primary.locale;
      },
      get translations() {
        return primary.translations;
      },
    },
  );
};

export const translateHTML = (html: string, t: Translate): string => {
  // Remove <script>...</script>, <style>...</style>, ... blocks, translate, then restore them
  const blocks: string[] = [];
  const placeholder = (i: number) => `__IGNORE_BLOCK_${i}__`;

  const stripped = html.replace(
    /<(script|style|code|pre)[\s\S]*?<\/\1>/gi,
    (match) => {
      blocks.push(match);
      return placeholder(blocks.length - 1);
    },
  );

  const translated = stripped.replace(
    // This regex looks for {{ t:key }} or {{ t:key, var1, var2 }} patterns
    // I've done this to prevent conflicts with other templating syntaxes
    // @fccview i don't really know what to do here, if you have any ideas to make this better please tell me
    /\{\{\s*t:([^}]+?)\s*\}\}/g,
    (_, content: string) => {
      const parts = content.split(",").map((p) => p.trim());
      const key = parts[0];
      const vars = parts.slice(1);

      if (vars.length === 0) return String(t(key));

      // Build a named vars record: each var name maps to its {{ }} template
      // placeholder so the client-side template engine can resolve it later.
      // e.g. "sources_text" > { sources_text: "{{ sources_text }}" }
      const namedVars: Record<string, string> = {};
      for (const v of vars) {
        namedVars[v] = `{{ ${v} }}`;
      }

      return String(t(key, namedVars));
    },
  );

  // Restore script blocks
  return translated.replace(
    /__IGNORE_BLOCK_(\d+)__/g,
    (_, i) => blocks[Number(i)],
  );
};

function deepMerge(
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
      deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
    } else {
      target[key] = sv;
    }
  }
  return target;
}

export const collectTranslationsForLocale = (
  entries: { namespace: string; translator: Translate }[],
  locale: string,
): Record<string, Record<string, TranslationRecord>> => {
  const result: Record<string, Record<string, TranslationRecord>> = {};
  for (const { namespace, translator } of entries) {
    if (!translator.translations) continue;

    const lang = getClosestLanguage(
      locale,
      Object.keys(translator.translations),
    );
    if (!lang) continue;

    const source = translator.translations[lang];
    if (!source || typeof source !== "object") continue;

    if (!result[namespace]) result[namespace] = {};
    deepMerge(result[namespace], source as Record<string, TranslationRecord>);
  }
  return result;
};

// This can cause issues if plugins tried to share global variables in the frontend
// tbh I'm not sure if that's a thing we want to support, @fccview what do you think?
export const injectScope = (html: string, namespace: string): string => {
  const ns = JSON.stringify(namespace);

  return html.replace(
    /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (_, open, body, close) =>
      `${open}(function(t){${body}})(typeof window.scopedT==="function"?window.scopedT(${ns}):function(k){return k});${close}`,
  );
};
