import { getEngineDefaultTransport } from "../extensions/engines/catalog";
import { noteEngineHost } from "../extensions/engines/engine-hosts";
import type { PageCounter } from "./page-counter";
import type {
  EngineContext,
  ImageFilter,
  SearchImage,
  SearchType,
} from "../types/search";
import {
  SentinelBreach,
  sentinel,
  type ThreatLevel,
} from "../utils/security/sentinel";
import { extractImageUrl } from "../utils/extract-image";
import { getRandomUserAgent } from "../utils/net/user-agents";
import {
  outgoingFetch,
  parseOutgoingTransport,
  pickProxyUrl,
} from "../utils/net/outgoing";
import { fetchPastAnubis } from "../utils/net/challenges/anubis";
import { resolveTransport } from "../extensions/transports/registry";
import {
  ENGINE_CHALLENGE,
  type EngineChallenge,
  type TransportFetchOptions,
} from "../types/extension";
import { asString, getSettings } from "../utils/settings/plugin-settings";
import { buildSignedProxyUrl } from "../utils/net/proxy-sign";
import { engineRouteUrl } from "../extensions/engines/engine-routes";

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
  image?: SearchImage;
  signal?: AbortSignal;
  searchType?: SearchType;
  pageCounter?: PageCounter;
  challenges?: readonly EngineChallenge[];
  engineName?: string;
  routeBase?: string;
}

const _solvesAnubis = (
  challenges: readonly EngineChallenge[] | undefined,
  transport: string,
): boolean =>
  !!challenges?.includes(ENGINE_CHALLENGE.ANUBIS) &&
  resolveTransport(transport).handlesChallenges !== true;

export const createSearchEngineContext = (
  engineSettingsId: string | undefined,
  options: EngineContextOptions = {},
): EngineContext => {
  const {
    lang,
    dateFrom,
    dateTo,
    imageFilter,
    image,
    signal,
    searchType,
    pageCounter,
    challenges,
    engineName: engineLabel,
    routeBase,
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
      const requestInit = customUa
        ? { ...baseInit, headers: { ...(baseInit.headers ?? {}), "User-Agent": customUa } }
        : baseInit;
      const target = typeof url === "string" ? url : String(url);
      const proxyOptions = { proxyOverrideEnabled, proxyOverrideUrls };
      if (!_solvesAnubis(challenges, transport)) {
        return outgoingFetch(target, requestInit, transport, {
          ...proxyOptions,
          engineId: engineSettingsId,
        });
      }
      const pinnedProxyUrl = (await pickProxyUrl(proxyOptions)) ?? null;
      const send = (next: string, requestOptions: TransportFetchOptions) =>
        outgoingFetch(next, requestOptions, transport, {
          ...proxyOptions,
          engineId: engineSettingsId,
          pinnedProxyUrl,
        });
      return fetchPastAnubis(send, target, requestInit, {
        jarKey: `${transport}|${engineSettingsId ?? ""}|${pinnedProxyUrl ?? "direct"}`,
        engine: engineLabel,
      });
    },
    lang: resolvedLang,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    buildAcceptLanguage: () => _buildAcceptLanguage(resolvedLang),
    userAgent: () => getRandomUserAgent(),
    extractImageUrl: extractImageUrl as EngineContext["extractImageUrl"],
    signProxyUrl: buildSignedProxyUrl,
    ...(routeBase
      ? {
          apiBase: routeBase,
          routeUrl: (path: string) => engineRouteUrl(routeBase, path),
        }
      : {}),
    imageFilter,
    ...(image ? { image } : {}),
    sentinel: (response, engineName) =>
      sentinel(response, engineName ?? engineSettingsId ?? "engine"),
    engineError: (status, message, opts) =>
      new SentinelBreach(status as ThreatLevel, message, opts),
    searchType,
    pagination: pageCounter?.report,
  };
};
