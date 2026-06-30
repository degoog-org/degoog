import {
  getEngineDefaultTransport,
  getEngineIdByInstance,
  getEngineMap,
} from "./extensions/engines/registry";
import { resolveTransport } from "./extensions/transports/registry";
import { selectActiveEngines } from "./search/engine-selection";
import type {
  EngineConfig,
  EngineContext,
  EngineTiming,
  ImageFilter,
  ScoredResult,
  SearchEngine,
  SearchResponse,
  SearchResult,
  SearchType,
  TimeFilter,
} from "./types";

import {
  THREAT_LEVEL,
  SentinelBreach,
  isSentinelBreach,
  sentinel,
  type ThreatLevel,
} from "./utils/sentinel";
import { extractImageUrl } from "./utils/extract-image";
import { getRandomUserAgent } from "./utils/user-agents";
import { logger } from "./utils/logger";
import { outgoingFetch, parseOutgoingTransport } from "./utils/outgoing";
import { stripHtml, stripCssBlocks } from "./utils/text";
import { asString, getSettings } from "./utils/plugin-settings";
import { buildSignedProxyUrl } from "./utils/proxy-sign";
import { cleanUrl, normalizeUrl, urlIsGif } from "./search/url-normalize";

const MAX_PAGE = 10;
const ENGINE_TIMEOUT_MS = 10_000;

const ENGINE_TIMEOUT_BUFFER_MS = 5000;

const _getEngineTimeout = async (
  engineSettingsId: string | undefined,
): Promise<number> => {
  if (!engineSettingsId) return ENGINE_TIMEOUT_MS;
  let raw =
    asString((await getSettings(engineSettingsId)).outgoingTransport) ||
    undefined;
  if (!raw) raw = getEngineDefaultTransport(engineSettingsId) ?? undefined;
  const transportName = parseOutgoingTransport(raw);
  const transport = resolveTransport(transportName);
  if (transport.timeoutMs && transport.timeoutMs > ENGINE_TIMEOUT_MS) {
    return transport.timeoutMs + ENGINE_TIMEOUT_BUFFER_MS;
  }
  return ENGINE_TIMEOUT_MS;
};

const _mergeIntoMap = (
  urlMap: Map<string, ScoredResult>,
  results: SearchResult[],
  multiplier = 1,
): void => {
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const normalized = normalizeUrl(r.url);
    const insecure = normalized.startsWith("http://");
    const positionScore = Math.max(10 - i, 1) * multiplier;

    if (urlMap.has(normalized)) {
      const existing = urlMap.get(normalized)!;
      existing.score += positionScore + 5;
      if (!existing.sources.includes(r.source)) {
        existing.sources.push(r.source);
      }
      const cleanSnippet = stripCssBlocks(stripHtml(r.snippet));
      if (cleanSnippet.length > existing.snippet.length) {
        existing.snippet = cleanSnippet;
      }
      if (r.thumbnail && !existing.thumbnail) {
        existing.thumbnail = r.thumbnail;
      }
      if (
        r.imageUrl &&
        (!existing.imageUrl || (!existing.isGif && urlIsGif(r.imageUrl)))
      ) {
        existing.imageUrl = r.imageUrl;
        existing.isGif = urlIsGif(r.imageUrl);
      }
      if (insecure) existing.insecure = true;
    } else {
      urlMap.set(normalized, {
        ...r,
        title: stripCssBlocks(stripHtml(r.title)),
        snippet: stripCssBlocks(stripHtml(r.snippet)),
        url: cleanUrl(r.url),
        score: positionScore,
        sources: [r.source],
        insecure,
        isGif: urlIsGif(r.imageUrl),
      });
    }
  }
};

const _sortedFromMap = (urlMap: Map<string, ScoredResult>): ScoredResult[] => {
  const scored = Array.from(urlMap.values());
  scored.sort((a, b) => b.score - a.score);
  return scored;
};

const _withTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  onTimeout?: () => void,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error("Engine timeout"));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const _classifyReject = (
  err: unknown,
): { status: string; httpStatus?: number; reason: string } => {
  if (isSentinelBreach(err)) {
    return {
      status: err.status,
      httpStatus: err.httpStatus,
      reason: err.message,
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/timeout/i.test(msg)) {
    return { status: THREAT_LEVEL.TIMEOUT, reason: msg };
  }
  return { status: THREAT_LEVEL.NETWORK, reason: msg };
};

export const scoreResults = (
  allResults: { results: SearchResult[]; multiplier?: number }[],
): ScoredResult[] => {
  const urlMap = new Map<string, ScoredResult>();
  for (const { results, multiplier } of allResults) {
    _mergeIntoMap(urlMap, results, multiplier ?? 1);
  }
  return _sortedFromMap(urlMap);
};

export const mergeNewResults = (
  existing: ScoredResult[],
  newResults: SearchResult[],
): ScoredResult[] => {
  const urlMap = new Map<string, ScoredResult>();
  for (const r of existing) {
    urlMap.set(normalizeUrl(r.url), { ...r, sources: [...r.sources] });
  }
  _mergeIntoMap(urlMap, newResults);
  return _sortedFromMap(urlMap);
};

export const resolveEngine = (engineName: string): SearchEngine | null => {
  const engineMap = getEngineMap();
  if (engineMap[engineName]) return engineMap[engineName];
  for (const engine of Object.values(engineMap)) {
    if (engine.name === engineName) return engine;
  }
  return null;
};

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

export const createSearchEngineContext = (
  engineSettingsId: string | undefined,
  lang?: string,
  dateFrom?: string,
  dateTo?: string,
  imageFilter?: ImageFilter,
  signal?: AbortSignal,
  searchType?: SearchType,
): EngineContext => {
  const resolvedLang =
    lang ||
    (process.env.DEGOOG_DEFAULT_SEARCH_LANGUAGE || "")
      .trim()
      .split(/[-_]/)[0]
      .toLowerCase() ||
    undefined;
  return {
    fetch: async (url, init) => {
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
        });
      const headers = { ...(baseInit.headers ?? {}), "User-Agent": customUa };
      return outgoingFetch(url, { ...baseInit, headers }, transport, {
        proxyOverrideEnabled,
        proxyOverrideUrls,
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
  };
};

export const searchSingleEngine = async (
  engineName: string,
  query: string,
  page: number = 1,
  timeFilter: TimeFilter = "any",
  lang?: string,
  dateFrom?: string,
  dateTo?: string,
  imageFilter?: ImageFilter,
  signal?: AbortSignal,
  searchType?: SearchType,
): Promise<{ results: SearchResult[]; timing: EngineTiming }> => {
  const engine = resolveEngine(engineName);
  if (!engine) {
    return {
      results: [],
      timing: { name: engineName, time: 0, resultCount: 0, status: THREAT_LEVEL.BLOCKED },
    };
  }
  const p = Math.max(1, Math.min(MAX_PAGE, Math.floor(page) || 1));
  const t0 = performance.now();
  const engineSettingsId = getEngineIdByInstance(engine);
  const ac = new AbortController();
  if (signal) {
    if (signal.aborted) ac.abort();
    else signal.addEventListener("abort", () => ac.abort(), { once: true });
  }
  const engineContext = createSearchEngineContext(
    engineSettingsId,
    lang,
    dateFrom,
    dateTo,
    imageFilter,
    ac.signal,
    searchType,
  );
  try {
    const timeout = await _getEngineTimeout(engineSettingsId);
    const results = await _withTimeout(
      engine.executeSearch(query, p, timeFilter, engineContext),
      timeout,
      () => ac.abort(),
    );
    const elapsed = Math.round(performance.now() - t0);
    return {
      results,
      timing: { name: engine.name, time: elapsed, resultCount: results.length },
    };
  } catch (err) {
    const elapsed = Math.round(performance.now() - t0);
    const classified = _classifyReject(err);
    logger.warn("engine", `${engine.name} failed after ${elapsed}ms status=${classified.status}`, err);
    return {
      results: [],
      timing: { name: engine.name, time: elapsed, resultCount: 0, status: classified.status, errorReason: classified.reason, httpStatus: classified.httpStatus },
    };
  }
};

export const search = async (
  query: string,
  config: EngineConfig,
  type: SearchType = "web",
  page: number = 1,
  timeFilter: TimeFilter = "any",
  lang?: string,
  dateFrom?: string,
  dateTo?: string,
  imageFilter?: ImageFilter,
): Promise<SearchResponse> => {
  const start = performance.now();
  const p = Math.max(1, Math.min(MAX_PAGE, Math.floor(page) || 1));

  const rawActiveEngines = await selectActiveEngines(type, config, imageFilter);

  if (rawActiveEngines.length === 0) {
    return {
      results: [],
      query,
      totalTime: 0,
      type,
      engineTimings: [],
      relatedSearches: [],
    };
  }

  const settled = await Promise.allSettled(
    rawActiveEngines.map(async ({ instance, id }) => {
      const t0 = performance.now();
      const ac = new AbortController();
      const ctx = createSearchEngineContext(
        id,
        lang,
        dateFrom,
        dateTo,
        imageFilter,
        ac.signal,
        type,
      );
      const timeout = await _getEngineTimeout(id);
      const results = await _withTimeout(
        instance.executeSearch(query, p, timeFilter, ctx),
        timeout,
        () => ac.abort(),
      );
      return { results, elapsed: Math.round(performance.now() - t0) };
    }),
  );

  const allResults: { results: SearchResult[]; multiplier: number }[] = [];
  const engineTimings: EngineTiming[] = [];

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    const engineName = rawActiveEngines[i].instance.name;
    if (result.status === "fulfilled") {
      allResults.push({
        results: result.value.results,
        multiplier: rawActiveEngines[i].score,
      });
      engineTimings.push({
        name: engineName,
        time: result.value.elapsed,
        resultCount: result.value.results.length,
        status: THREAT_LEVEL.OK,
      });
    } else {
      const classified = _classifyReject(result.reason);
      logger.warn(
        "search",
        `engine="${engineName}" status=${classified.status}${
          classified.httpStatus ? ` http=${classified.httpStatus}` : ""
        } reason="${classified.reason}"`,
      );
      engineTimings.push({
        name: engineName,
        time: ENGINE_TIMEOUT_MS,
        resultCount: 0,
        status: classified.status,
        errorReason: classified.reason,
        httpStatus: classified.httpStatus,
      });
    }
  }

  const scored = scoreResults(allResults);
  const totalTime = Math.round(performance.now() - start);

  return {
    results: scored,
    query,
    totalTime,
    type,
    engineTimings,
    relatedSearches: [],
  };
};
