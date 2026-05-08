import type { Hono } from "hono";
import { search } from "../../search";
import type { SearchType } from "../../types";
import * as cache from "../../utils/cache";
import { cacheKey, parseEngineConfig } from "../../utils/search";
import { logger } from "../../utils/logger";
import { applyDomainRules } from "./_domain-rules";

export function registerLuckyRoute(router: Hono): void {
  router.get("/api/lucky", async (c) => {
    const query = c.req.query("q");
    if (!query) return c.json({ error: "Missing query parameter 'q'" }, 400);

    const engines = parseEngineConfig(new URL(c.req.url).searchParams);
    const key = cacheKey(query, engines, "web" as SearchType, 1);
    let response = cache.get(key);
    if (response) {
      const qShort = query.trim().slice(0, 80);
      const enginesOn = Object.values(engines).filter(Boolean).length;
      logger.debug(
        "search",
        `cache hit q="${qShort}" type=web page=1 enginesOn=${enginesOn} results=${response.results.length} timings=${response.engineTimings.length}`,
      );
    } else {
      response = await search(query, engines, "web" as SearchType, 1);
      cache.set(key, response);
    }
    const luckyResults = await applyDomainRules(response.results);
    if (luckyResults.length > 0) return c.redirect(luckyResults[0].url);
    return c.json({ error: "No results found" }, 404);
  });
}
