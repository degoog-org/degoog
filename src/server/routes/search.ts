import { Hono, type Context } from "hono";
import * as cache from "../cache";
import { search, searchSingleEngine, mergeNewResults } from "../search";
import {
  getEngineRegistry,
  getEnginesForCustomType,
  getCustomEngineTypes,
} from "../extensions/engines/registry";
import { getSlotPlugins } from "../extensions/slots/registry";
import {
  getSearchResultTabs,
  getSearchResultTabById,
} from "../extensions/search-result-tabs/registry";
import { getSettings } from "../plugin-settings";
import { getClientIp } from "../utils/request";
import { outgoingFetch } from "../outgoing";
import { checkRateLimit } from "../rate-limit";
import type {
  EngineConfig,
  SearchType,
  TimeFilter,
  SearchResponse,
  SlotPanelResult,
  ScoredResult,
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
    return c.json(
      { error: "Too many requests" },
      429,
      { "Retry-After": String(result.retryAfterSec) },
    );
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

function cacheKey(
  query: string,
  engines: EngineConfig,
  type: SearchType,
  page: number,
  timeFilter: TimeFilter = "any",
): string {
  const q = query.trim().toLowerCase();
  return `${q}|${JSON.stringify(engines)}|${type}|${page}|${timeFilter}`;
}

async function runSlotPlugins(
  query: string,
  clientIp?: string,
  results?: ScoredResult[],
  options?: { excludePosition?: "at-a-glance" },
): Promise<SlotPanelResult[]> {
  const plugins = getSlotPlugins();
  const panels: SlotPanelResult[] = [];
  const exclude = options?.excludePosition;
  for (const plugin of plugins) {
    if (exclude && plugin.position === exclude) continue;
    try {
      const slotSettingsId = plugin.settingsId ?? `slot-${plugin.id}`;
      const slotSettings = await getSettings(slotSettingsId);
      if (slotSettings["disabled"] === "true") continue;
      const ok = await Promise.resolve(plugin.trigger(query.trim()));
      if (!ok) continue;
      const context = { clientIp, results };
      const out = await plugin.execute(query, context);
      if (!out.html || !out.html.trim()) continue;
      panels.push({
        id: plugin.id,
        title: out.title,
        html: out.html,
        position: plugin.position,
      });
    } catch {}
  }
  return panels;
}

router.get("/api/search", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;
  const searchType = (c.req.query("type") || "all") as SearchType;
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
  const key = cacheKey(query, engines, searchType, page, timeFilter);

  const cached = cache.get(key);
  let response: SearchResponse;
  if (cached) {
    response = cached;
  } else {
    response = await search(query, engines, searchType, page, timeFilter);
    const ttl = cache.hasFailedEngines(response)
      ? cache.SHORT_TTL_MS
      : searchType === "news"
        ? cache.NEWS_TTL_MS
        : undefined;
    cache.set(key, response, ttl);
  }

  if (searchType === "all") {
    const clientIp = getClientIp(c);
    const slotPanels = await runSlotPlugins(
      query.trim(),
      clientIp ?? undefined,
      response.results,
      { excludePosition: "at-a-glance" },
    );
    response = { ...response, slotPanels };
  }

  return c.json(response);
});

router.get("/api/slots", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;
  const query = c.req.query("q");
  if (!query || !query.trim()) return c.json({ panels: [] });
  const clientIp = getClientIp(c);
  const panels = await runSlotPlugins(query.trim(), clientIp, undefined, {
    excludePosition: "at-a-glance",
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
    (p) => p.position === "at-a-glance",
  );
  const panels: SlotPanelResult[] = [];
  for (const plugin of glancePlugins) {
    try {
      const slotSettingsId = plugin.settingsId ?? `slot-${plugin.id}`;
      const slotSettings = await getSettings(slotSettingsId);
      if (slotSettings["disabled"] === "true") continue;
      const ok = await Promise.resolve(plugin.trigger(body.query!.trim()));
      if (!ok) continue;
      const out = await plugin.execute(body.query!.trim(), {
        clientIp: clientIp ?? undefined,
        results: body.results,
      });
      if (!out.html || !out.html.trim()) continue;
      panels.push({
        id: plugin.id,
        title: out.title,
        html: out.html,
        position: plugin.position,
      });
    } catch {}
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
  const searchType = (c.req.query("type") || "all") as SearchType;
  const page = Math.max(
    1,
    Math.min(10, Math.floor(Number(c.req.query("page"))) || 1),
  );
  const timeFilter = (c.req.query("time") || "any") as TimeFilter;

  const { results: newResults, timing } = await searchSingleEngine(
    engineName,
    query,
    page,
    timeFilter,
  );
  const key = cacheKey(query, engines, searchType, page, timeFilter);
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
  const key = cacheKey(query, engines, "all", 1);
  let response = cache.get(key);
  if (!response) {
    response = await search(query, engines, "all", 1);
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
    const tabSettings = await getSettings(settingsId);
    if (tabSettings["disabled"] === "true") continue;
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

  try {
    const allResults: ScoredResult[] = [];
    let totalPages = 1;

    if (engineType) {
      const engines = getEnginesForCustomType(engineType);
      const engineContext = { fetch: outgoingFetch };
      const settled = await Promise.allSettled(
        engines.map((e) =>
          e.executeSearch(query.trim(), page, undefined, engineContext),
        ),
      );
      let idx = 0;
      for (const s of settled) {
        if (s.status === "fulfilled") {
          for (const r of s.value) {
            allResults.push({
              ...r,
              score: Math.max(100 - idx, 1),
              sources: [r.source],
            });
            idx++;
          }
        }
      }
      if (allResults.length > 0) totalPages = 10;
    }

    if (tab?.executeSearch) {
      const result = await tab.executeSearch(query.trim(), page, {
        clientIp: clientIp ?? undefined,
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

    return c.json({ results: allResults, totalPages, page });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Tab search failed" },
      500,
    );
  }
});

export default router;
