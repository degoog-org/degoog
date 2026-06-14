import { Context } from "hono";
import {
  getDefaultEngineConfig,
  listEngineIds,
} from "../extensions/engines/registry";
import { getSlotPlugins } from "../extensions/slots/registry";
import {
  EngineConfig,
  ImageFilter,
  ScoredResult,
  SearchType,
  SLOT_POSITION_SETTING_KEY,
  SlotPanelPosition,
  SlotPanel,
  SlotPluginContext,
  TimeFilter,
} from "../types";
import { createCache, useCache } from "./cache";
import { logger } from "./logger";
import { outgoingFetch } from "./outgoing";
import { asString, getSettings, isDisabled } from "./plugin-settings";
import { checkRateLimit } from "./rate-limit";
import { buildSignedProxyUrl } from "./proxy-sign";
import { getClientIp } from "./request";
import { applyFilter, syncVortexSignal } from "./translation-circuit";
import { getInstanceSettings } from "./server-settings";
import { SLOT_PLUGIN_TIMEOUT_MS, withTimeout } from "./with-timeout";

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

export const _applyRateLimit = async (c: Context): Promise<Response | null> => {
  const settings = await getInstanceSettings();
  const opts: Record<string, string> = {};
  for (const [k, v] of Object.entries(settings)) {
    opts[k] = typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? "") : "";
  }
  if (opts.rateLimitEnabled !== "true") return null;
  const ip = getClientIp(c) ?? "unknown";
  const result = checkRateLimit(ip, opts);
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

export function cacheKey(
  query: string,
  engines: EngineConfig,
  type: SearchType,
  page: number,
  timeFilter: TimeFilter = "any",
  lang = "",
  dateFrom = "",
  dateTo = "",
  imageFilter?: ImageFilter,
  engineSettings = "",
): string {
  const q = query.trim().toLowerCase();
  const imgKey = imageFilter
    ? `${imageFilter.color || ""}|${imageFilter.size || ""}|${imageFilter.type || ""}|${imageFilter.layout || ""}|${imageFilter.nsfw || ""}`
    : "";
  return `${q}|${JSON.stringify(engines)}|${type}|${page}|${timeFilter}|${lang}|${dateFrom}|${dateTo}|${imgKey}|${engineSettings}`;
}

export async function runSlotPlugins(
  query: string,
  clientIp?: string,
  results?: ScoredResult[],
  options?: { excludePosition?: SlotPanelPosition; locale?: string },
): Promise<SlotPanel[]> {
  const plugins = getSlotPlugins();
  const panels: SlotPanel[] = [];
  const exclude = options?.excludePosition;
  const locale = options?.locale;
  for (const plugin of plugins) {
    if (!plugin.id) {
      logger.warn(
        "slots",
        `Skipping slot plugin: missing id (name="${plugin.name}")`,
      );
      continue;
    }
    const slotSettingsId = plugin.settingsId ?? `slot-${plugin.id}`;
    let definedPosition: SlotPanelPosition = plugin.position;

    if (plugin.slotPositions?.length) {
      const raw = await getSettings(slotSettingsId);
      const chosen = asString(raw[SLOT_POSITION_SETTING_KEY]);
      if (
        chosen &&
        plugin.slotPositions.includes(chosen as SlotPanelPosition)
      ) {
        definedPosition = chosen as SlotPanelPosition;
      }
    }
    if (exclude && definedPosition === exclude) continue;
    const withResults = results !== undefined;
    if (withResults && !plugin.waitForResults) continue;
    if (!withResults && plugin.waitForResults) continue;
    try {
      if (await isDisabled(slotSettingsId)) continue;
      const ok = await Promise.resolve(plugin.trigger(query.trim()));
      if (!ok) continue;
      const context: SlotPluginContext = {
        clientIp,
        results: plugin.waitForResults ? results : undefined,
        fetch: outgoingFetch as SlotPluginContext["fetch"],
        signProxyUrl: buildSignedProxyUrl,
        createCache,
        useCache,
      };
      const t0 = performance.now();
      const out = await withTimeout(
        Promise.resolve(plugin.execute(query, context)),
        SLOT_PLUGIN_TIMEOUT_MS,
        `slot ${plugin.id}`,
      );
      logger.debug(
        "plugin",
        `${plugin.id} executed in ${Math.round(performance.now() - t0)}ms`,
      );
      if (!out.html || !out.html.trim()) continue;
      panels.push({
        id: plugin.id,
        title: out.title,
        html: applyFilter(
          plugin.t ? syncVortexSignal(out.html, plugin.t, locale) : out.html,
          `slots/${plugin.id}`,
        ),
        position: definedPosition,
        gridSize: plugin.gridSize,
      });
    } catch (err) {
      logger.debug("plugin", `${plugin.id} skipped`, err);
    }
  }
  return panels;
}

export const isValidQuery = (query: string): boolean => {
  return typeof query === "string" && query.trim().length > 0;
};
