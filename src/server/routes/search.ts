import { Hono } from "hono";
import {
  getCustomEngineTypes,
  getEngineRegistry,
  getEnginesForCustomType,
} from "../extensions/engines/registry";
import {
  getSearchResultTabById,
  getSearchResultTabs,
} from "../extensions/search-result-tabs/registry";
import {
  createSearchEngineContext,
  mergeNewResults,
  search,
  searchSingleEngine,
} from "../search";
import {
  type EngineConfig,
  type EngineTiming,
  type RetryPostBody,
  type ScoredResult,
  type SearchBody,
  type SearchParams,
  type SearchType,
  type TimeFilter,
} from "../types";
import * as cache from "../utils/cache";
import {
  applyDomainReplacements,
  filterBlockedDomains,
} from "../utils/domain-filter";
import { logger } from "../utils/logger";
import { isDisabled } from "../utils/plugin-settings";
import { getClientIp } from "../utils/request";
import {
  _applyRateLimit,
  cacheKey,
  isValidQuery,
  parseEngineConfig,
} from "../utils/search";

const router = new Hono();

function _parsePage(raw: unknown): number {
  return Math.max(1, Math.min(10, Math.floor(Number(raw)) || 1));
}

function _parseEnginesFromBody(enabledList?: string[]): EngineConfig {
  const registry = getEngineRegistry();
  const enabledSet = enabledList ? new Set(enabledList) : null;
  const engines: EngineConfig = {};
  for (const { id } of registry) {
    engines[id] = enabledSet ? enabledSet.has(id) : true;
  }
  return engines;
}

async function _handleSearch(params: SearchParams) {
  const {
    query,
    engines,
    searchType,
    page,
    timeFilter,
    lang,
    dateFrom,
    dateTo,
  } = params;
  const key = cacheKey(
    query,
    engines,
    searchType,
    page,
    timeFilter,
    lang,
    dateFrom,
    dateTo,
  );

  const cached = cache.get(key);
  if (cached) return cached;

  const response = await search(
    query,
    engines,
    searchType,
    page,
    timeFilter,
    lang,
    dateFrom,
    dateTo,
  );

  const ttl = cache.hasFailedEngines(response)
    ? cache.SHORT_TTL_MS
    : searchType === "news"
      ? cache.NEWS_TTL_MS
      : undefined;
  cache.set(key, response, ttl);

  return response;
}

async function _handleRetry(params: SearchParams & { engineName: string }) {
  const {
    query,
    engineName,
    engines,
    searchType,
    page,
    timeFilter,
    lang,
    dateFrom,
    dateTo,
  } = params;

  const { results: newResults, timing } = await searchSingleEngine(
    engineName,
    query,
    page,
    timeFilter,
    lang,
    dateFrom,
    dateTo,
  );
  const key = cacheKey(
    query,
    engines,
    searchType,
    page,
    timeFilter,
    lang,
    dateFrom,
    dateTo,
  );
  const cached = cache.get(key);

  if (cached) {
    const updatedTimings = cached.engineTimings.map((et) =>
      et.name === engineName ? timing : et,
    );
    const merged =
      newResults.length > 0
        ? mergeNewResults(cached.results, newResults)
        : cached.results;
    const updated = {
      ...cached,
      results: merged,
      engineTimings: updatedTimings,
    };
    cache.set(
      key,
      updated,
      cache.hasFailedEngines(updated) ? cache.SHORT_TTL_MS : undefined,
    );
    return updated;
  }

  return {
    results: newResults.map((r, i) => ({
      ...r,
      score: Math.max(10 - i, 1),
      sources: [r.source],
    })),
    timing,
    engineTimings: [timing],
  };
}

router.get("/api/search", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;

  const query = c.req.query("q") ?? "";
  if (!isValidQuery(query))
    return c.json({ error: "Missing or invalid query parameter 'q'" }, 400);

  const result = await _handleSearch({
    query,
    engines: parseEngineConfig(new URL(c.req.url).searchParams),
    searchType: (c.req.query("type") || "web") as SearchType,
    page: _parsePage(c.req.query("page")),
    timeFilter: (c.req.query("time") || "any") as TimeFilter,
    lang: c.req.query("lang") || "",
    dateFrom: c.req.query("dateFrom") || "",
    dateTo: c.req.query("dateTo") || "",
  });

  return c.json(result);
});

router.post("/api/search", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;

  const body = await c.req.json<SearchBody>();
  const query = body.query ?? "";
  if (!isValidQuery(query))
    return c.json({ error: "Missing or invalid query parameter 'q'" }, 400);

  const result = await _handleSearch({
    query,
    engines: _parseEnginesFromBody(body.engines),
    searchType: (body.type || "web") as SearchType,
    page: _parsePage(body.page),
    timeFilter: (body.time || "any") as TimeFilter,
    lang: body.lang || "",
    dateFrom: body.dateFrom || "",
    dateTo: body.dateTo || "",
  });

  return c.json(result);
});

router.get("/api/search/retry", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;

  const query = c.req.query("q");
  const engineName = c.req.query("engine");
  if (!query || !engineName)
    return c.json({ error: "Missing 'q' or 'engine' parameter" }, 400);

  const result = await _handleRetry({
    query,
    engineName,
    engines: parseEngineConfig(new URL(c.req.url).searchParams),
    searchType: (c.req.query("type") || "web") as SearchType,
    page: _parsePage(c.req.query("page")),
    timeFilter: (c.req.query("time") || "any") as TimeFilter,
    lang: c.req.query("lang") || "",
    dateFrom: c.req.query("dateFrom") || "",
    dateTo: c.req.query("dateTo") || "",
  });

  return c.json(result);
});

router.post("/api/search/retry", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;

  const body = await c.req.json<RetryPostBody>();
  const query = body.query ?? "";
  const engineName = body.engine ?? "";
  if (!query || !engineName)
    return c.json({ error: "Missing 'query' or 'engine' parameter" }, 400);

  const result = await _handleRetry({
    query,
    engineName,
    engines: _parseEnginesFromBody(body.engines),
    searchType: (body.type || "web") as SearchType,
    page: _parsePage(body.page),
    timeFilter: (body.time || "any") as TimeFilter,
    lang: body.lang || "",
    dateFrom: body.dateFrom || "",
    dateTo: body.dateTo || "",
  });

  return c.json(result);
});

router.post("/api/ai-chat", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;
  let body: { messages?: { role: string; content: string }[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return c.json({ error: "Missing messages" }, 400);
  }
  const { chatFollowUp } =
    await import("../extensions/commands/builtins/ai-summary/index");
  const reply = await chatFollowUp(
    body.messages as {
      role: "system" | "user" | "assistant";
      content: string;
    }[],
  );
  if (!reply) return c.json({ error: "AI request failed" }, 502);
  return c.json({ reply });
});

router.get("/api/lucky", async (c) => {
  const query = c.req.query("q");
  if (!query) return c.json({ error: "Missing query parameter 'q'" }, 400);

  const engines = parseEngineConfig(new URL(c.req.url).searchParams);
  const key = cacheKey(query, engines, "web", 1);
  let response = cache.get(key);
  if (!response) {
    response = await search(query, engines, "web", 1);
    cache.set(key, response);
  }
  if (response.results.length > 0) return c.redirect(response.results[0].url);
  return c.json({ error: "No results found" }, 404);
});

router.get("/api/search-tabs", async (c) => {
  const seen = new Set<string>();
  const list: { id: string; name: string; icon: string | null }[] = [];

  for (const engineType of getCustomEngineTypes()) {
    seen.add(engineType);
    list.push({
      id: `engine:${engineType}`,
      name: engineType.charAt(0).toUpperCase() + engineType.slice(1),
      icon: null,
    });
  }

  const tabs = getSearchResultTabs();
  for (const tab of tabs) {
    if (tab.engineType && seen.has(tab.engineType)) {
      const existing = list.find((t) => t.id === `engine:${tab.engineType}`);
      if (existing) {
        existing.name = tab.name;
        existing.icon = tab.icon ?? null;
        existing.id = tab.id;
      }
      continue;
    }
    const settingsId = tab.settingsId ?? `tab-${tab.id}`;
    if (await isDisabled(settingsId)) continue;
    list.push({ id: tab.id, name: tab.name, icon: tab.icon ?? null });
  }
  return c.json({ tabs: list });
});

router.get("/api/tab-search", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;
  const tabId = c.req.query("tab");
  const query = c.req.query("q");
  if (!tabId || !query?.trim())
    return c.json({ error: "Missing tab or q" }, 400);

  const page = Math.max(
    1,
    Math.min(10, Math.floor(Number(c.req.query("page"))) || 1),
  );
  const clientIp = getClientIp(c);

  let engineType: string | undefined;
  const tab = getSearchResultTabById(tabId);

  if (tabId.startsWith("engine:")) {
    engineType = tabId.slice(7);
  } else if (tab?.engineType) {
    engineType = tab.engineType;
  } else if (!tab) {
    return c.json({ error: "Tab not found" }, 404);
  }

  const startTime = performance.now();
  const engineTimings: EngineTiming[] = [];

  try {
    const allResults: ScoredResult[] = [];
    let totalPages = 1;

    if (engineType) {
      const engines = getEnginesForCustomType(engineType);
      const outcomes = await Promise.all(
        engines.map(async ({ id, instance: e }) => {
          const start = performance.now();
          const engineContext = createSearchEngineContext(id);
          try {
            const value = await e.executeSearch(
              query.trim(),
              page,
              undefined,
              engineContext,
            );
            return {
              name: e.name,
              time: Math.round(performance.now() - start),
              resultCount: value.length,
              results: value,
            };
          } catch {
            return {
              name: e.name,
              time: Math.round(performance.now() - start),
              resultCount: 0,
              results: [] as ScoredResult[],
            };
          }
        }),
      );
      for (const o of outcomes) {
        engineTimings.push({
          name: o.name,
          time: o.time,
          resultCount: o.resultCount,
        });
        let idx = allResults.length;
        for (const r of o.results) {
          allResults.push({
            ...r,
            score: Math.max(100 - idx, 1),
            sources: [r.source],
          });
          idx++;
        }
      }
      if (allResults.length > 0) totalPages = 10;
    }

    if (
      tab?.executeSearch &&
      !(await isDisabled(tab.settingsId ?? `tab-${tab.id}`))
    ) {
      const tabStart = performance.now();
      const result = await tab.executeSearch(query.trim(), page, {
        clientIp: clientIp ?? undefined,
      });
      const tabElapsed = Math.round(performance.now() - tabStart);
      logger.debug("plugin", `${tab.id} executed in ${tabElapsed}ms`);
      engineTimings.push({
        name: tab.name,
        time: tabElapsed,
        resultCount: result.results.length,
      });
      const offset = allResults.length;
      for (let i = 0; i < result.results.length; i++) {
        const r = result.results[i];
        allResults.push({
          ...r,
          score: Math.max(100 - offset - i, 1),
          sources: [r.source],
        });
      }
      if (result.totalPages && result.totalPages > totalPages)
        totalPages = result.totalPages;
    }

    const totalTime = Math.round(performance.now() - startTime);
    const afterBlock = await filterBlockedDomains(allResults);
    const finalResults = await applyDomainReplacements(afterBlock);
    return c.json({
      results: finalResults,
      totalPages,
      page,
      engineTimings,
      totalTime,
    });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Tab search failed" },
      500,
    );
  }
});

export default router;
