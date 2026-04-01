import { Hono, type Context } from "hono";
import * as cache from "../utils/cache";
import {
  search,
  searchSingleEngine,
  scoreResults,
  mergeNewResults,
  fetchRelatedSearches,
  fetchKnowledgePanel,
  createSearchEngineContext,
} from "../search";
import {
  getEngineRegistry,
  getEnginesForCustomType,
  getCustomEngineTypes,
  getActiveWebEngines,
  getEnginesForSearchType as getEnginesForType,
} from "../extensions/engines/registry";
import { getSlotPlugins } from "../extensions/slots/registry";
import {
  getSearchResultTabs,
  getSearchResultTabById,
} from "../extensions/search-result-tabs/registry";
import { asString, getSettings, isDisabled } from "../utils/plugin-settings";
import { getClientIp } from "../utils/request";
import { outgoingFetch } from "../utils/outgoing";
import { checkRateLimit } from "../utils/rate-limit";
import { debug } from "../utils/logger";
import {
  SLOT_POSITION_SETTING_KEY,
  SlotPanelPosition,
  type EngineConfig,
  type SlotPluginContext,
  type SearchType,
  type TimeFilter,
  type SearchResponse,
  type SlotPanelResult,
  type ScoredResult,
  type EngineTiming,
} from "../types";

const DEGOOG_SETTINGS_ID = "degoog-settings";
const router = new Hono();

const _applyRateLimit = async (c: Context): Promise<Response | null> => {
  const settings = await getSettings(DEGOOG_SETTINGS_ID);
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

function parseEngineConfig(query: URLSearchParams): EngineConfig {
  const registry = getEngineRegistry();
  const config: EngineConfig = {};
  for (const { id } of registry) {
    config[id] = query.get(id) !== "false";
  }
  return config;
}

const DEFAULT_LANGUAGES = [
  "af","am","ar","az","be","bg","bn","bs","ca","cs",
  "cy","da","de","el","en","eo","es","et","eu","fa",
  "fi","fr","ga","gl","gu","he","hi","hr","hu","hy",
  "id","is","it","ja","ka","kk","km","kn","ko","ku",
  "ky","lb","lo","lt","lv","mk","ml","mn","mr","ms",
  "my","ne","nl","no","or","pa","pl","ps","pt","ro",
  "ru","sd","si","sk","sl","so","sq","sr","st","sv",
  "sw","ta","te","tg","th","tk","tl","tr","uk","ur",
  "uz","vi","xh","yi","yo","zh","zu",
];

function cacheKey(
  query: string,
  engines: EngineConfig,
  type: SearchType,
  page: number,
  timeFilter: TimeFilter = "any",
  lang = "",
  dateFrom = "",
  dateTo = "",
): string {
  const q = query.trim().toLowerCase();
  return `${q}|${JSON.stringify(engines)}|${type}|${page}|${timeFilter}|${lang}|${dateFrom}|${dateTo}`;
}

async function runSlotPlugins(
  query: string,
  clientIp?: string,
  results?: ScoredResult[],
  options?: { excludePosition?: SlotPanelPosition },
): Promise<SlotPanelResult[]> {
  const plugins = getSlotPlugins();
  const panels: SlotPanelResult[] = [];
  const exclude = options?.excludePosition;
  for (const plugin of plugins) {
    const slotSettingsId = plugin.settingsId ?? `slot-${plugin.id}`;
    let effectivePosition: SlotPanelPosition = plugin.position;
    if (plugin.slotPositions?.length) {
      const raw = await getSettings(slotSettingsId);
      const chosen = asString(raw[SLOT_POSITION_SETTING_KEY]);
      if (chosen && plugin.slotPositions.includes(chosen as SlotPanelPosition)) {
        effectivePosition = chosen as SlotPanelPosition;
      }
    }
    if (exclude && effectivePosition === exclude) continue;
    try {
      if (await isDisabled(slotSettingsId)) continue;
      const ok = await Promise.resolve(plugin.trigger(query.trim()));
      if (!ok) continue;
      const context: SlotPluginContext = {
        clientIp,
        results,
        fetch: outgoingFetch as SlotPluginContext["fetch"],
      };
      const t0 = performance.now();
      const out = await plugin.execute(query, context);
      debug("plugin", `${plugin.id} executed in ${Math.round(performance.now() - t0)}ms`);
      if (!out.html || !out.html.trim()) continue;
      panels.push({
        id: plugin.id,
        title: out.title,
        html: out.html,
        position: effectivePosition,
      });
    } catch { }
  }
  return panels;
}

router.get("/api/search", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;
  const searchType = (c.req.query("type") || "web") as SearchType;
  let query = c.req.query("q") ?? "";
  if (typeof query !== "string") query = "";
  if (!query.trim())
    return c.json({ error: "Missing query parameter 'q'" }, 400);

  const engines = parseEngineConfig(new URL(c.req.url).searchParams);
  const page = Math.max(
    1,
    Math.min(10, Math.floor(Number(c.req.query("page"))) || 1),
  );
  const timeFilter = (c.req.query("time") || "any") as TimeFilter;
  const lang = c.req.query("lang") || "";
  const dateFrom = c.req.query("dateFrom") || "";
  const dateTo = c.req.query("dateTo") || "";
  const key = cacheKey(query, engines, searchType, page, timeFilter, lang, dateFrom, dateTo);

  const cached = cache.get(key);
  let response: SearchResponse;
  if (cached) {
    response = cached;
  } else {
    response = await search(query, engines, searchType, page, timeFilter, lang, dateFrom, dateTo);
    const ttl = cache.hasFailedEngines(response)
      ? cache.SHORT_TTL_MS
      : searchType === "news"
        ? cache.NEWS_TTL_MS
        : undefined;
    cache.set(key, response, ttl);
  }

  return c.json(response);
});

router.get("/api/search/stream", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;
  const searchType = (c.req.query("type") || "web") as SearchType;
  let query = c.req.query("q") ?? "";
  if (typeof query !== "string") query = "";
  if (!query.trim())
    return c.json({ error: "Missing query parameter 'q'" }, 400);

  const engines = parseEngineConfig(new URL(c.req.url).searchParams);
  const page = Math.max(
    1,
    Math.min(10, Math.floor(Number(c.req.query("page"))) || 1),
  );
  const timeFilter = (c.req.query("time") || "any") as TimeFilter;
  const lang = c.req.query("lang") || "";
  const dateFrom = c.req.query("dateFrom") || "";
  const dateTo = c.req.query("dateTo") || "";
  const key = cacheKey(query, engines, searchType, page, timeFilter, lang, dateFrom, dateTo);

  const cached = cache.get(key);
  if (cached) {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        for (const et of cached.engineTimings) {
          controller.enqueue(
            encoder.encode(`event: engine-result\ndata: ${JSON.stringify({
              engine: et.name,
              timing: et,
              results: cached.results,
              retry: false,
              attempt: 0,
            })}\n\n`),
          );
        }
        controller.enqueue(
          encoder.encode(`event: done\ndata: ${JSON.stringify({
            totalTime: cached.totalTime,
            engineTimings: cached.engineTimings,
            relatedSearches: cached.relatedSearches,
            knowledgePanel: cached.knowledgePanel,
            atAGlance: cached.atAGlance,
          })}\n\n`),
        );
        controller.close();
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const settings = await getSettings(DEGOOG_SETTINGS_ID);
  const autoRetry = asString(settings.streamingAutoRetry) === "true";
  const maxRetries = Math.min(5, Math.max(1, parseInt(asString(settings.streamingMaxRetries) || "2", 10)));

  const rawActiveEngines =
    searchType === "web"
      ? await getActiveWebEngines(engines)
      : getEnginesForType(searchType, engines).map((e) => ({
          id: e.id,
          instance: e.instance,
          score: 1,
        }));

  if (rawActiveEngines.length === 0) {
    return c.json({
      results: [],
      atAGlance: null,
      query,
      totalTime: 0,
      type: searchType,
      engineTimings: [],
      relatedSearches: [],
      knowledgePanel: null,
    });
  }

  const start = performance.now();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const allTimings: EngineTiming[] = [];
      const allRawResults: { results: import("../types").SearchResult[]; multiplier: number }[] = [];

      function _send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      }

      const enginePromises = rawActiveEngines.map(async ({ instance, score, id }) => {
        const engineName = instance.name;
        let attempt = 0;
        let lastTiming: EngineTiming = { name: engineName, time: 0, resultCount: 0 };

        while (attempt <= (autoRetry ? maxRetries : 0)) {
          const isRetry = attempt > 0;
          const { results, timing } = await searchSingleEngine(
            id,
            query,
            page,
            timeFilter,
            lang,
            dateFrom,
            dateTo,
          );
          lastTiming = timing;

          if (timing.resultCount > 0) {
            allRawResults.push({ results, multiplier: score });
            allTimings.push(timing);
            _send("engine-result", {
              engine: engineName,
              timing,
              results: scoreResults(allRawResults),
              retry: isRetry,
              attempt,
            });
            return;
          }

          attempt++;
          if (attempt <= (autoRetry ? maxRetries : 0)) {
            _send("engine-retry", {
              engine: engineName,
              attempt,
              maxRetries,
              timing,
            });
          }
        }

        allTimings.push(lastTiming);
        _send("engine-result", {
          engine: engineName,
          timing: lastTiming,
          results: scoreResults(allRawResults),
          retry: false,
          attempt: 0,
        });
      });

      void Promise.all(enginePromises).then(async () => {
        const totalTime = Math.round(performance.now() - start);
        const finalResults = scoreResults(allRawResults);
        const atAGlance =
          searchType === "web" && finalResults.length > 0 && finalResults[0].snippet
            ? finalResults[0]
            : null;

        let relatedSearches: string[] = [];
        let knowledgePanel: import("../types").KnowledgePanel | null = null;
        if (searchType === "web" && page === 1) {
          [relatedSearches, knowledgePanel] = await Promise.all([
            fetchRelatedSearches(query).catch(() => [] as string[]),
            fetchKnowledgePanel(query).catch(() => null),
          ]);
        }

        const response: SearchResponse = {
          results: finalResults,
          atAGlance,
          query,
          totalTime,
          type: searchType,
          engineTimings: allTimings,
          relatedSearches,
          knowledgePanel,
        };

        const ttl = cache.hasFailedEngines(response)
          ? cache.SHORT_TTL_MS
          : searchType === "news"
            ? cache.NEWS_TTL_MS
            : undefined;
        cache.set(key, response, ttl);

        _send("done", {
          totalTime,
          engineTimings: allTimings,
          relatedSearches,
          knowledgePanel,
          atAGlance,
        });
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

router.get("/api/slots", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;
  const query = c.req.query("q");
  if (!query || !query.trim()) return c.json({ panels: [] });
  const clientIp = getClientIp(c);
  const panels = await runSlotPlugins(query.trim(), clientIp, undefined, {
    excludePosition: SlotPanelPosition.AtAGlance,
  });
  return c.json({ panels });
});

router.post("/api/slots/glance", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;
  let body: { query?: string; results?: ScoredResult[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  if (!body.query || !Array.isArray(body.results)) {
    return c.json({ error: "Missing query or results" }, 400);
  }
  const clientIp = getClientIp(c);
  const glancePlugins = getSlotPlugins().filter(
    (p) => p.position === SlotPanelPosition.AtAGlance,
  );
  const panels: SlotPanelResult[] = [];
  for (const plugin of glancePlugins) {
    try {
      const slotSettingsId = plugin.settingsId ?? `slot-${plugin.id}`;
      if (await isDisabled(slotSettingsId)) continue;
      const ok = await Promise.resolve(plugin.trigger(body.query!.trim()));
      if (!ok) continue;
      const context: SlotPluginContext = {
        clientIp: clientIp ?? undefined,
        results: body.results,
        fetch: outgoingFetch as SlotPluginContext["fetch"],
      };
      const t0 = performance.now();
      const out = await plugin.execute(body.query!.trim(), context);
      debug("plugin", `${plugin.id} executed in ${Math.round(performance.now() - t0)}ms`);
      if (!out.html || !out.html.trim()) continue;
      panels.push({
        id: plugin.id,
        title: out.title,
        html: out.html,
        position: plugin.position,
      });
    } catch { }
  }
  return c.json({ panels });
});

router.get("/api/search/retry", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;
  const query = c.req.query("q");
  const engineName = c.req.query("engine");
  if (!query || !engineName)
    return c.json({ error: "Missing 'q' or 'engine' parameter" }, 400);

  const engines = parseEngineConfig(new URL(c.req.url).searchParams);
  const searchType = (c.req.query("type") || "web") as SearchType;
  const page = Math.max(
    1,
    Math.min(10, Math.floor(Number(c.req.query("page"))) || 1),
  );
  const timeFilter = (c.req.query("time") || "any") as TimeFilter;
  const lang = c.req.query("lang") || "";
  const dateFrom = c.req.query("dateFrom") || "";
  const dateTo = c.req.query("dateTo") || "";

  const { results: newResults, timing } = await searchSingleEngine(
    engineName,
    query,
    page,
    timeFilter,
    lang,
    dateFrom,
    dateTo,
  );
  const key = cacheKey(query, engines, searchType, page, timeFilter, lang, dateFrom, dateTo);
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
      atAGlance:
        merged.length > 0 && merged[0].snippet ? merged[0] : cached.atAGlance,
    };
    cache.set(
      key,
      updated,
      cache.hasFailedEngines(updated) ? cache.SHORT_TTL_MS : undefined,
    );
    return c.json(updated);
  }

  return c.json({
    results: newResults.map((r, i) => ({
      ...r,
      score: Math.max(10 - i, 1),
      sources: [r.source],
    })),
    timing,
    engineTimings: [timing],
  });
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

    if (tab?.executeSearch && !(await isDisabled(tab.settingsId ?? `tab-${tab.id}`))) {
      const tabStart = performance.now();
      const result = await tab.executeSearch(query.trim(), page, {
        clientIp: clientIp ?? undefined,
      });
      const tabElapsed = Math.round(performance.now() - tabStart);
      debug("plugin", `${tab.id} executed in ${tabElapsed}ms`);
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
    return c.json({
      results: allResults,
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

router.get("/api/settings/languages", async (c) => {
  const settings = await getSettings(DEGOOG_SETTINGS_ID);
  if (asString(settings["languagesEnabled"] ?? "") !== "true") {
    return c.json({ languages: DEFAULT_LANGUAGES });
  }
  const raw = asString(settings["languages"] ?? "");
  const codes = raw
    .split(/[\n,]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z]{2,3}$/.test(s));
  return c.json({ languages: codes.length > 0 ? codes : DEFAULT_LANGUAGES });
});

router.get("/api/settings/streaming", async (c) => {
  const settings = await getSettings(DEGOOG_SETTINGS_ID);
  return c.json({
    enabled: asString(settings.streamingEnabled) === "true",
    autoRetry: asString(settings.streamingAutoRetry) === "true",
    maxRetries: parseInt(asString(settings.streamingMaxRetries) || "2", 10),
  });
});

export default router;
