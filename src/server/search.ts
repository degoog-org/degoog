import {
  getActiveWebEngines,
  getEngineDefaultTransport,
  getEngineIdByInstance,
  getEngineMap,
  getEnginesForSearchType,
} from "./extensions/engines/registry";
import { resolveTransport } from "./extensions/transports/registry";
import type {
  EngineConfig,
  EngineContext,
  EngineTiming,
  ScoredResult,
  SearchEngine,
  SearchResponse,
  SearchResult,
  SearchType,
  TimeFilter,
} from "./types";
import {
  filterBlockedDomains,
  applyDomainReplacements,
} from "./utils/domain-filter";
import { outgoingFetch, parseOutgoingTransport } from "./utils/outgoing";
import { asString, getSettings } from "./utils/plugin-settings";

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

const _normalizeUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.searchParams.delete("utm_source");
    parsed.searchParams.delete("utm_medium");
    parsed.searchParams.delete("utm_campaign");
    return parsed.href.replace(/\/+$/, "");
  } catch {
    return url;
  }
};

const _mergeIntoMap = (
  urlMap: Map<string, ScoredResult>,
  results: SearchResult[],
  multiplier = 1,
): void => {
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const normalized = _normalizeUrl(r.url);
    const positionScore = Math.max(10 - i, 1) * multiplier;

    if (urlMap.has(normalized)) {
      const existing = urlMap.get(normalized)!;
      existing.score += positionScore + 5;
      if (!existing.sources.includes(r.source)) {
        existing.sources.push(r.source);
      }
      if (r.snippet.length > existing.snippet.length) {
        existing.snippet = r.snippet;
      }
      if (r.thumbnail && !existing.thumbnail) {
        existing.thumbnail = r.thumbnail;
      }
    } else {
      urlMap.set(normalized, {
        ...r,
        url: normalized,
        score: positionScore,
        sources: [r.source],
      });
    }
  }
};

const _sortedFromMap = (urlMap: Map<string, ScoredResult>): ScoredResult[] => {
  const scored = Array.from(urlMap.values());
  scored.sort((a, b) => b.score - a.score);
  return scored;
};

export const fetchRelatedSearches = async (
  query: string,
): Promise<string[]> => {
  try {
    const res = await outgoingFetch(
      `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`,
    );
    const buf = await res.arrayBuffer();
    const data = JSON.parse(new TextDecoder("iso-8859-1").decode(buf)) as [
      string,
      string[],
    ];
    return (data[1] || [])
      .filter((s: string) => s.toLowerCase() !== query.toLowerCase())
      .slice(0, 8);
  } catch {
    return [];
  }
};

const _withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Engine timeout")), ms),
    ),
  ]);
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
    urlMap.set(_normalizeUrl(r.url), { ...r, sources: [...r.sources] });
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

export const createSearchEngineContext = (
  engineSettingsId: string | undefined,
  lang?: string,
  dateFrom?: string,
  dateTo?: string,
): EngineContext => ({
  fetch: async (url, init) => {
    let raw: string | undefined;
    if (engineSettingsId !== undefined) {
      raw =
        asString((await getSettings(engineSettingsId)).outgoingTransport) ||
        undefined;
    }
    if (!raw && engineSettingsId !== undefined) {
      raw = getEngineDefaultTransport(engineSettingsId) ?? undefined;
    }
    const transport = parseOutgoingTransport(raw);
    return outgoingFetch(url, init ?? {}, transport);
  },
  lang: lang || undefined,
  dateFrom: dateFrom || undefined,
  dateTo: dateTo || undefined,
  buildAcceptLanguage: () => _buildAcceptLanguage(lang),
});

export const searchSingleEngine = async (
  engineName: string,
  query: string,
  page: number = 1,
  timeFilter: TimeFilter = "any",
  lang?: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<{ results: SearchResult[]; timing: EngineTiming }> => {
  const engine = resolveEngine(engineName);
  if (!engine) {
    return {
      results: [],
      timing: { name: engineName, time: 0, resultCount: 0 },
    };
  }
  const p = Math.max(1, Math.min(MAX_PAGE, Math.floor(page) || 1));
  const t0 = performance.now();
  const engineSettingsId = getEngineIdByInstance(engine);
  const engineContext = createSearchEngineContext(
    engineSettingsId,
    lang,
    dateFrom,
    dateTo,
  );
  try {
    const timeout = await _getEngineTimeout(engineSettingsId);
    const results = await _withTimeout(
      engine.executeSearch(query, p, timeFilter, engineContext),
      timeout,
    );
    const elapsed = Math.round(performance.now() - t0);
    return {
      results,
      timing: { name: engine.name, time: elapsed, resultCount: results.length },
    };
  } catch {
    const elapsed = Math.round(performance.now() - t0);
    return {
      results: [],
      timing: { name: engine.name, time: elapsed, resultCount: 0 },
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
): Promise<SearchResponse> => {
  const start = performance.now();
  const p = Math.max(1, Math.min(MAX_PAGE, Math.floor(page) || 1));

  const rawActiveEngines =
    type === "web"
      ? await getActiveWebEngines(config)
      : getEnginesForSearchType(type, config).map((e) => ({
          id: e.id,
          instance: e.instance,
          score: 1,
        }));

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
      const ctx = createSearchEngineContext(id, lang, dateFrom, dateTo);
      const timeout = await _getEngineTimeout(id);
      const results = await _withTimeout(
        instance.executeSearch(query, p, timeFilter, ctx),
        timeout,
      );
      return { results, elapsed: Math.round(performance.now() - t0) };
    }),
  );

  const allResults: { results: SearchResult[]; multiplier: number }[] = [];
  const engineTimings: EngineTiming[] = [];

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    if (result.status === "fulfilled") {
      allResults.push({
        results: result.value.results,
        multiplier: rawActiveEngines[i].score,
      });
      engineTimings.push({
        name: rawActiveEngines[i].instance.name,
        time: result.value.elapsed,
        resultCount: result.value.results.length,
      });
    } else {
      engineTimings.push({
        name: rawActiveEngines[i].instance.name,
        time: ENGINE_TIMEOUT_MS,
        resultCount: 0,
      });
    }
  }

  const scored = scoreResults(allResults);
  const filtered = await filterBlockedDomains(scored);
  const processed = await applyDomainReplacements(filtered);

  let relatedSearches: string[] = [];

  if (type === "web" && p === 1) {
    relatedSearches = await _withTimeout(
      fetchRelatedSearches(query),
      ENGINE_TIMEOUT_MS,
    ).catch(() => []);
  }

  const totalTime = Math.round(performance.now() - start);

  return {
    results: processed,
    query,
    totalTime,
    type,
    engineTimings,
    relatedSearches,
  };
};
