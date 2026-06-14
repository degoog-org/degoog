import type { Hono } from "hono";
import { search } from "../../search";
import type { SearchType } from "../../types";
import * as cache from "../../utils/cache";
import { _applyRateLimit, cacheKey, parseEngineConfig } from "../../utils/search";
import { logger } from "../../utils/logger";
import { guardApiKey } from "../../utils/api-key-guard";
import { applyDomainRules } from "./_domain-rules";
import { engineSettingsFingerprint } from "../../search/engine-selection";

export function registerLuckyRoute(router: Hono): void {
  router.get("/api/lucky", async (c) => {
    const limitRes = await _applyRateLimit(c);
    if (limitRes) return limitRes;
    const authRes = await guardApiKey(c, "apiKeySearchEnabled");
    if (authRes) return authRes;
    const query = c.req.query("q");
    if (!query) return c.json({ error: "Missing query parameter 'q'" }, 400);

    const engines = parseEngineConfig(new URL(c.req.url).searchParams);
    const type = "web" as SearchType;
    const key = cacheKey(
      query,
      engines,
      type,
      1,
      "any",
      "",
      "",
      "",
      undefined,
      await engineSettingsFingerprint(type, engines),
    );
    let response = await cache.get(key);
    if (response) {
      const qShort = query.trim().slice(0, 80);
      const enginesOn = Object.values(engines).filter(Boolean).length;
      logger.debug(
        "search",
        `cache hit q="${qShort}" type=web page=1 enginesOn=${enginesOn} results=${response.results.length} timings=${response.engineTimings.length}`,
      );
    } else {
      response = await search(query, engines, type, 1);
      await cache.set(key, response);
    }
    const luckyResults = await applyDomainRules(response.results);
    if (luckyResults.length > 0) return c.redirect(luckyResults[0].url);
    return c.json({ error: "No results found" }, 404);
  });
}
