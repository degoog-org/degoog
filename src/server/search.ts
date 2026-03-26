import type {
  SearchEngine,
  SearchResult,
  ScoredResult,
  SearchResponse,
  EngineConfig,
  SearchType,
  EngineTiming,
  KnowledgePanel,
  TimeFilter,
  EngineContext,
} from "./types";
import {
  getEngineMap,
  getActiveWebEngines,
  getEnginesForSearchType,
} from "./extensions/engines/registry";
import { outgoingFetch } from "./utils/outgoing";

const MAX_PAGE = 10;
const ENGINE_TIMEOUT_MS = 10_000;

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
): void => {
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const normalized = _normalizeUrl(r.url);
    const positionScore = Math.max(10 - i, 1);

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

const _fetchRelatedSearches = async (query: string): Promise<string[]> => {
  try {
    const res = await fetch(
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

const _fetchKnowledgePanel = async (
  query: string,
): Promise<KnowledgePanel | null> => {
  try {
    const params = new URLSearchParams({
      action: "query",
      titles: query,
      prop: "extracts|pageimages|info",
      exintro: "1",
      explaintext: "1",
      pithumbsize: "300",
      inprop: "url",
      format: "json",
      redirects: "1",
    });
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?${params.toString()}`,
      {
        headers: { "Api-User-Agent": "degoog/1.0" },
      },
    );
    const data = (await res.json()) as {
      query: {
        pages: Record<
          string,
          {
            title: string;
            extract?: string;
            thumbnail?: { source: string };
            fullurl?: string;
            pageid: number;
          }
        >;
      };
    };
    const pages = data.query.pages;
    const page = Object.values(pages)[0];
    if (
      !page ||
      page.pageid === undefined ||
      (page as Record<string, unknown>).missing !== undefined ||
      !page.extract
    )
      return null;
    return {
      title: page.title,
      description: page.extract.substring(0, 500),
      image: page.thumbnail?.source,
      url:
        page.fullurl ||
        `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
    };
  } catch {
    return null;
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

export const aggregateAndScore = (
  allResults: SearchResult[][],
): ScoredResult[] => {
  const urlMap = new Map<string, ScoredResult>();
  for (const engineResults of allResults) {
    _mergeIntoMap(urlMap, engineResults);
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

const _makeEngineContext = (lang?: string, dateFrom?: string, dateTo?: string): EngineContext => ({
  fetch: outgoingFetch,
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
  const engineContext = _makeEngineContext(lang, dateFrom, dateTo);
  try {
    const results = await _withTimeout(
      engine.executeSearch(query, p, timeFilter, engineContext),
      ENGINE_TIMEOUT_MS,
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
  type: SearchType = "all",
  page: number = 1,
  timeFilter: TimeFilter = "any",
  lang?: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<SearchResponse> => {
  const start = performance.now();
  const p = Math.max(1, Math.min(MAX_PAGE, Math.floor(page) || 1));

  const activeEngines =
    type === "all"
      ? await getActiveWebEngines(config)
      : getEnginesForSearchType(type, config);

  if (activeEngines.length === 0) {
    return {
      results: [],
      atAGlance: null,
      query,
      totalTime: 0,
      type,
      engineTimings: [],
      relatedSearches: [],
      knowledgePanel: null,
    };
  }

  const engineStarts = activeEngines.map(() => performance.now());
  const engineContext = _makeEngineContext(lang, dateFrom, dateTo);

  const settled = await Promise.allSettled(
    activeEngines.map(async (engine, i) => {
      engineStarts[i] = performance.now();
      const results = await _withTimeout(
        engine.executeSearch(query, p, timeFilter, engineContext),
        ENGINE_TIMEOUT_MS,
      );
      return results;
    }),
  );

  const allResults: SearchResult[][] = [];
  const engineTimings: EngineTiming[] = [];

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    const elapsed = Math.round(performance.now() - engineStarts[i]);
    if (result.status === "fulfilled") {
      allResults.push(result.value);
      engineTimings.push({
        name: activeEngines[i].name,
        time: elapsed,
        resultCount: result.value.length,
      });
    } else {
      engineTimings.push({
        name: activeEngines[i].name,
        time: elapsed,
        resultCount: 0,
      });
    }
  }

  const scored = aggregateAndScore(allResults);
  const atAGlance =
    type === "all" && scored.length > 0 && scored[0].snippet ? scored[0] : null;

  let relatedSearches: string[] = [];
  let knowledgePanel: KnowledgePanel | null = null;

  if (type === "all" && p === 1) {
    [relatedSearches, knowledgePanel] = await Promise.all([
      _withTimeout(_fetchRelatedSearches(query), ENGINE_TIMEOUT_MS).catch(
        () => [],
      ),
      _withTimeout(_fetchKnowledgePanel(query), ENGINE_TIMEOUT_MS).catch(
        () => null,
      ),
    ]);
  }

  const totalTime = Math.round(performance.now() - start);

  return {
    results: scored,
    atAGlance,
    query,
    totalTime,
    type,
    engineTimings,
    relatedSearches,
    knowledgePanel,
  };
};
