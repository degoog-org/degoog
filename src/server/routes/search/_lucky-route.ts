import type { Hono } from "hono";
import { search } from "../../search";
import type { SearchType } from "../../types";
import { _applyRateLimit, parseEngineConfig } from "../../utils/search";
import { guardApiKey } from "../../utils/api-key-guard";
import { applyDomainRules } from "./_domain-rules";

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
    const response = await search(query, engines, type, 1);
    const luckyResults = await applyDomainRules(response.results);
    if (luckyResults.length > 0) return c.redirect(luckyResults[0].url);
    return c.json({ error: "No results found" }, 404);
  });
}
