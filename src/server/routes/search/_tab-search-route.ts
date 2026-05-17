import type { Hono } from "hono";
import { getEnginesForCustomType } from "../../extensions/engines/registry";
import { getSearchResultTabById } from "../../extensions/search-result-tabs/registry";
import { createSearchEngineContext } from "../../search";
import type { EngineTiming, ScoredResult } from "../../types";
import { applyDomainRules } from "./_domain-rules";
import { logger } from "../../utils/logger";
import { isDisabled } from "../../utils/plugin-settings";
import { getClientIp } from "../../utils/request";
import { _applyRateLimit } from "../../utils/search";

export function registerTabSearchRoute(router: Hono): void {
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
        const engines = await getEnginesForCustomType(engineType);
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
      const finalResults = await applyDomainRules(allResults);
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
}
