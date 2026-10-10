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
import type { CachedEngineRun } from "../utils/cache/cache";
import { getRandomUserAgent } from "../utils/net/user-agents";
import {
  outgoingFetch,
  parseOutgoingTransport,
} from "../utils/net/outgoing";
import { fetchPastAnubis } from "../utils/net/challenges/anubis";
import { jerseyFor } from "../utils/net/proxy-bench";
import { isProxyConnectError } from "../utils/net/proxy-error";
import { resolveTransport } from "../extensions/transports/registry";
import {
  ENGINE_CHALLENGE,
  type EngineChallenge,
  type TransportFetchOptions,
} from "../types/extension";
import { asString, getSettings } from "../utils/settings/plugin-settings";
import { buildSignedProxyUrl } from "../utils/net/proxy-sign";
import { engineRouteUrl } from "../extensions/engines/engine-routes";
import {
  openSession,
  SESSION_CLOSED_MESSAGE,
  type EngineSession,
} from "./engine-session";

const _buildRegionalAcceptLanguage = (lang: string, region: string): string =>
  lang === "en"
    ? `en-${region},en;q=0.9`
    : `${lang}-${region},${lang};q=0.9,en;q=0.8`;

const _buildAcceptLanguage = (lang?: string, region?: string): string => {
  if (region) return _buildRegionalAcceptLanguage(lang || "en", region);
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
  region?: string;
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
  firstPage?: Pick<CachedEngineRun, "proxyId" | "carry"> | null;
}

export interface BoxScore {
  proxyId?: string;
  carry?: Record<string, string>;
}

const CARRY_MAX_KEYS = 16;
const CARRY_MAX_CHARS = 4096;

const _cleanCarry = (data: unknown): Record<string, string> | undefined => {
  if (!data || typeof data !== "object") return undefined;
  const entries = Object.entries(data as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .slice(0, CARRY_MAX_KEYS);
  if (entries.length === 0) return undefined;
  const clean = Object.fromEntries(entries);
  return JSON.stringify(clean).length <= CARRY_MAX_CHARS ? clean : undefined;
};

const _solvesAnubis = (
  challenges: readonly EngineChallenge[] | undefined,
  transport: string,
): boolean =>
  !!challenges?.includes(ENGINE_CHALLENGE.ANUBIS) &&
  resolveTransport(transport).handlesChallenges !== true;

const _runSessions = new WeakMap<EngineContext, EngineSession>();
const _runCarry = new WeakMap<EngineContext, Record<string, string>>();

export const boxScore = async (context: EngineContext): Promise<BoxScore> => {
  const proxyId = await _runSessions.get(context)?.whoBatted();
  const carry = _runCarry.get(context);
  return {
    ...(proxyId ? { proxyId } : {}),
    ...(carry ? { carry } : {}),
  };
};

export const endRunSession = async (
  context: EngineContext,
  outcome?: string,
): Promise<void> => {
  const session = _runSessions.get(context);
  if (!session) return;
  _runSessions.delete(context);
  await session.close(outcome);
};

export const createSearchEngineContext = (
  engineSettingsId: string | undefined,
  options: EngineContextOptions = {},
): EngineContext => {
  const {
    lang,
    region,
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
    firstPage,
  } = options;
  const resolvedLang =
    lang ||
    (process.env.DEGOOG_DEFAULT_SEARCH_LANGUAGE || "")
      .trim()
      .split(/[-_]/)[0]
      .toLowerCase() ||
    undefined;
  const session = openSession(firstPage?.proxyId);
  const carried = _cleanCarry(firstPage?.carry);
  const context: EngineContext = {
    signal,
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
      const host = new URL(target).hostname;
      const proxyOptions = { proxyOverrideEnabled, proxyOverrideUrls };
      const pinnedProxy = await session.batterFor(proxyOptions, host);
      if (!session.touch(transport)) throw new Error(SESSION_CLOSED_MESSAGE);
      const outgoing = {
        ...proxyOptions,
        engineId: engineSettingsId,
        pinnedProxy,
        sessionKey: session.key,
      };
      const send = (next: string, requestOptions: TransportFetchOptions) =>
        outgoingFetch(next, requestOptions, transport, outgoing).catch((err: unknown) => {
          if (pinnedProxy && isProxyConnectError(err)) session.noteNoShow();
          throw err;
        });
      if (!_solvesAnubis(challenges, transport)) return send(target, requestInit);
      const egressKey = await jerseyFor(pinnedProxy?.id, host);
      return fetchPastAnubis(send, target, requestInit, {
        jarKey: `${transport}|${engineSettingsId ?? ""}|${egressKey}`,
        engine: engineLabel,
      });
    },
    lang: resolvedLang,
    region: region || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    buildAcceptLanguage: () => _buildAcceptLanguage(resolvedLang, region),
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
    carry: (data) => {
      const clean = _cleanCarry(data);
      if (clean) _runCarry.set(context, clean);
    },
    ...(carried ? { carried } : {}),
  };
  _runSessions.set(context, session);
  return context;
};
