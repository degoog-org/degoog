import { Context } from "hono";
import { getDefaultEngineConfig } from "../extensions/engines/catalog";
import { listEngineIds } from "../extensions/engines/loader";
import type { EngineConfig } from "../types/search";
import { checkRateLimit, rateLimitOptionsFrom } from "./security/rate-limit";
import { getClientIp } from "./net/request";
import { getInstanceSettings } from "./settings/server-settings";

export const DEFAULT_LANGUAGES = [
  "af",
  "am",
  "ar",
  "az",
  "be",
  "bg",
  "bn",
  "bs",
  "ca",
  "cs",
  "cy",
  "da",
  "de",
  "el",
  "en",
  "eo",
  "es",
  "et",
  "eu",
  "fa",
  "fi",
  "fr",
  "ga",
  "gl",
  "gu",
  "he",
  "hi",
  "hr",
  "hu",
  "hy",
  "id",
  "is",
  "it",
  "ja",
  "ka",
  "kk",
  "km",
  "kn",
  "ko",
  "ku",
  "ky",
  "lb",
  "lo",
  "lt",
  "lv",
  "mk",
  "ml",
  "mn",
  "mr",
  "ms",
  "my",
  "ne",
  "nl",
  "no",
  "or",
  "pa",
  "pl",
  "ps",
  "pt",
  "ro",
  "ru",
  "sd",
  "si",
  "sk",
  "sl",
  "so",
  "sq",
  "sr",
  "st",
  "sv",
  "sw",
  "ta",
  "te",
  "tg",
  "th",
  "tk",
  "tl",
  "tr",
  "uk",
  "ur",
  "uz",
  "vi",
  "xh",
  "yi",
  "yo",
  "zh",
  "zu",
];

export const resolveLanguages = (
  enabled: boolean,
  raw: string,
): string[] => {
  if (!enabled) return DEFAULT_LANGUAGES;
  const codes = raw
    .split(/[\n,]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z]{2,3}$/.test(s));
  return codes.length > 0 ? codes : DEFAULT_LANGUAGES;
};

export const _applyRateLimit = async (
  c: Context,
  bucket = "",
): Promise<Response | null> => {
  const settings = await getInstanceSettings();
  const opts = rateLimitOptionsFrom(settings);
  if (opts.rateLimitEnabled !== "true") return null;
  const ip = getClientIp(c) ?? "unknown";
  const result = checkRateLimit(`${bucket}${ip}`, opts);
  if (!result.allowed && result.retryAfterSec !== undefined) {
    return c.json({ error: "Too many requests" }, 429, {
      "Retry-After": String(result.retryAfterSec),
    });
  }
  return null;
};

export function parseEngineConfig(query: URLSearchParams): EngineConfig {
  const defaults = getDefaultEngineConfig();
  const config: EngineConfig = {};
  for (const id of listEngineIds()) {
    const raw = query.get(id);
    config[id] = raw === null ? !!defaults[id] : raw !== "false";
  }
  return config;
}

export const isValidQuery = (query: string): boolean => {
  return typeof query === "string" && query.trim().length > 0;
};
