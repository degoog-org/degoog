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
} from "./types";
import {
  getEngineMap,
  getActiveWebEngines,
  getEnginesForSearchType,
} from "./engines/registry";
import { BingImagesEngine } from "./engines/bing-images";
import { GoogleImagesEngine } from "./engines/google-images";
import { BingVideosEngine } from "./engines/bing-videos";
import { GoogleVideosEngine } from "./engines/google-videos";

const MAX_PAGE = 10;
const ENGINE_TIMEOUT_MS = 10_000;

const imageEngines: SearchEngine[] = [
  new GoogleImagesEngine(),
  new BingImagesEngine(),
];
const videoEngines: SearchEngine[] = [
  new GoogleVideosEngine(),
  new BingVideosEngine(),
];
function normalizeUrl(url: string): string {
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
}

export function aggregateAndScore(
  allResults: SearchResult[][],
): ScoredResult[] {
  const urlMap = new Map<string, ScoredResult>();

  for (const engineResults of allResults) {
    for (let i = 0; i < engineResults.length; i++) {
      const result = engineResults[i];
      const normalized = normalizeUrl(result.url);
      const positionScore = Math.max(10 - i, 1);

      if (urlMap.has(normalized)) {
        const existing = urlMap.get(normalized)!;
        existing.score += positionScore + 5;
        if (!existing.sources.includes(result.source)) {
          existing.sources.push(result.source);
        }
        if (result.snippet.length > existing.snippet.length) {
          existing.snippet = result.snippet;
        }
        if (result.thumbnail && !existing.thumbnail) {
          existing.thumbnail = result.thumbnail;
        }
      } else {
        urlMap.set(normalized, {
          ...result,
          url: normalized,
          score: positionScore,
          sources: [result.source],
        });
      }
    }
  }

  const scored = Array.from(urlMap.values());
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function mergeNewResults(
  existing: ScoredResult[],
  newResults: SearchResult[],
): ScoredResult[] {
  const urlMap = new Map<string, ScoredResult>();

  for (const r of existing) {
    urlMap.set(normalizeUrl(r.url), { ...r, sources: [...r.sources] });
  }

  for (let i = 0; i < newResults.length; i++) {
    const r = newResults[i];
    const normalized = normalizeUrl(r.url);
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
    } else {
      urlMap.set(normalized, {
        ...r,
        url: normalized,
        score: positionScore,
        sources: [r.source],
      });
    }
  }

  const scored = Array.from(urlMap.values());
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function getEnginesForType(
  type: SearchType,
  config: EngineConfig,
): SearchEngine[] {
  if (type === "images") return imageEngines;
  if (type === "videos") return videoEngines;
  if (type === "news") return getEnginesForSearchType(type, config);
  return [];
}

async function fetchRelatedSearches(query: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`,
    );
    const data = (await res.json()) as [string, string[]];
    return (data[1] || [])
      .filter((s: string) => s.toLowerCase() !== query.toLowerCase())
      .slice(0, 8);
  } catch {
    return [];
  }
}

async function fetchKnowledgePanel(
  query: string,
): Promise<KnowledgePanel | null> {
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
      (page as any).missing !== undefined ||
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
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Engine timeout")), ms),
    ),
  ]);
}

export function resolveEngine(engineName: string): SearchEngine | null {
  const engineMap = getEngineMap();
  if (engineMap[engineName]) return engineMap[engineName];
  for (const engine of Object.values(engineMap)) {
    if (engine.name === engineName) return engine;
  }
  for (const engine of [...imageEngines, ...videoEngines]) {
    if (engine.name === engineName) return engine;
  }
  return null;
}

export async function searchSingleEngine(
  engineName: string,
  query: string,
  page: number = 1,
  timeFilter: TimeFilter = "any",
): Promise<{ results: SearchResult[]; timing: EngineTiming }> {
  const engine = resolveEngine(engineName);
  if (!engine) {
    return {
      results: [],
      timing: { name: engineName, time: 0, resultCount: 0 },
    };
  }
  const p = Math.max(1, Math.min(MAX_PAGE, Math.floor(page) || 1));
  const t0 = performance.now();
  try {
    const results = await withTimeout(
      engine.executeSearch(query, p, timeFilter),
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
}

export async function search(
  query: string,
  config: EngineConfig,
  type: SearchType = "all",
  page: number = 1,
  timeFilter: TimeFilter = "any",
): Promise<SearchResponse> {
  const start = performance.now();
  const p = Math.max(1, Math.min(MAX_PAGE, Math.floor(page) || 1));

  const activeEngines =
    type === "all"
      ? await getActiveWebEngines(config)
      : getEnginesForType(type, config);

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

  const settled = await Promise.allSettled(
    activeEngines.map(async (engine, i) => {
      engineStarts[i] = performance.now();
      const results = await withTimeout(
        engine.executeSearch(query, p, timeFilter),
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
      fetchRelatedSearches(query),
      fetchKnowledgePanel(query),
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
}
