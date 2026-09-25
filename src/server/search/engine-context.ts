import { getEngineDefaultTransport } from "../extensions/engines/catalog";
import { noteEngineHost } from "../extensions/engines/engine-hosts";
import type { PageCounter } from "./page-counter";
import type {
  EngineContext,
  ImageFilter,
  SearchType,
} from "../types/search";
import {
  SentinelBreach,
  sentinel,
  type ThreatLevel,
} from "../utils/security/sentinel";
import { extractImageUrl } from "../utils/extract-image";
import { getRandomUserAgent } from "../utils/net/user-agents";
import { outgoingFetch, parseOutgoingTransport } from "../utils/net/outgoing";
import { asString, getSettings } from "../utils/settings/plugin-settings";
import { buildSignedProxyUrl } from "../utils/net/proxy-sign";

const _buildAcceptLanguage = (lang?: string): string => {
  if (!lang || lang === "en") return "en-US,en;q=0.9";
  return `${lang},${lang}-${lang.toUpperCase()};q=0.9,en;q=0.8`;
};

const _pickRandomUserAgentFromTextarea = (raw: string | undefined): string => {
  if (!raw) return "";
  const lines = raw
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  return lines[Math.floor(Math.random() * lines.length)] ?? "";
};

const _asBool = (v: string | undefined): boolean => {
  const normalized = (v ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
};

interface EngineContextOptions {
  lang?: string;
  dateFrom?: string;
  dateTo?: string;
  imageFilter?: ImageFilter;
  signal?: AbortSignal;
  searchType?: SearchType;
  pageCounter?: PageCounter;
}

export const createSearchEngineContext = (
  engineSettingsId: string | undefined,
  options: EngineContextOptions = {},
): EngineContext => {
  const {
    lang,
    dateFrom,
    dateTo,
    imageFilter,
    signal,
    searchType,
    pageCounter,
  } = options;
  const resolvedLang =
    lang ||
    (process.env.DEGOOG_DEFAULT_SEARCH_LANGUAGE || "")
      .trim()
      .split(/[-_]/)[0]
      .toLowerCase() ||
    undefined;
  return {
    fetch: async (url, init) => {
      noteEngineHost(engineSettingsId, typeof url === "string" ? url : String(url));
      let raw: string | undefined;
      let customUa = "";
      let proxyOverrideEnabled = false;
      let proxyOverrideUrls = "";
      if (engineSettingsId !== undefined) {
        const settings = await getSettings(engineSettingsId);
        raw = asString(settings.outgoingTransport) || undefined;
        customUa = _pickRandomUserAgentFromTextarea(
          asString(settings.customUserAgents) || undefined,
        );
        proxyOverrideEnabled = _asBool(asString(settings.proxyOverrideEnabled));
        proxyOverrideUrls = asString(settings.proxyOverrideUrls);
      }
      if (!raw && engineSettingsId !== undefined) {
        raw = getEngineDefaultTransport(engineSettingsId) ?? undefined;
      }
      const transport = parseOutgoingTransport(raw);
      const baseInit = { ...(init ?? {}) };
      if (signal && !baseInit.signal) baseInit.signal = signal;
      if (!customUa)
        return outgoingFetch(url, baseInit, transport, {
          proxyOverrideEnabled,
          proxyOverrideUrls,
          engineId: engineSettingsId,
        });
      const headers = { ...(baseInit.headers ?? {}), "User-Agent": customUa };
      return outgoingFetch(url, { ...baseInit, headers }, transport, {
        proxyOverrideEnabled,
        proxyOverrideUrls,
        engineId: engineSettingsId,
      });
    },
    lang: resolvedLang,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    buildAcceptLanguage: () => _buildAcceptLanguage(resolvedLang),
    userAgent: () => getRandomUserAgent(),
    extractImageUrl: extractImageUrl as EngineContext["extractImageUrl"],
    signProxyUrl: buildSignedProxyUrl,
    imageFilter,
    sentinel: (response, engineName) =>
      sentinel(response, engineName ?? engineSettingsId ?? "engine"),
    engineError: (status, message, opts) =>
      new SentinelBreach(status as ThreatLevel, message, opts),
    searchType,
    pagination: pageCounter?.report,
  };
};
