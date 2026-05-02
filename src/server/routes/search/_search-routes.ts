import type { Hono } from "hono";
import type {
  SearchBody,
  SearchType,
  TimeFilter,
  RetryPostBody,
} from "../../types";
import {
  _applyRateLimit,
  isValidQuery,
  parseEngineConfig,
} from "../../utils/search";
import { parseEnginesFromBody, parsePage } from "./_parsers";
import { handleRetry, handleSearch } from "./_search-handlers";

export function registerSearchRoutes(router: Hono): void {
  router.get("/api/search", async (c) => {
    const limitRes = await _applyRateLimit(c);
    if (limitRes) return limitRes;

    const query = c.req.query("q") ?? "";
    if (!isValidQuery(query))
      return c.json({ error: "Missing or invalid query parameter 'q'" }, 400);

    const result = await handleSearch({
      query,
      engines: parseEngineConfig(new URL(c.req.url).searchParams),
      searchType: (c.req.query("type") || "web") as SearchType,
      page: parsePage(c.req.query("page")),
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

    let body: SearchBody;
    try {
      body = await c.req.json<SearchBody>();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    const query = body.query ?? "";
    if (!isValidQuery(query))
      return c.json({ error: "Missing or invalid query parameter 'q'" }, 400);

    const result = await handleSearch({
      query,
      engines: parseEnginesFromBody(body.engines),
      searchType: (body.type || "web") as SearchType,
      page: parsePage(body.page),
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

    const result = await handleRetry({
      query,
      engineName,
      engines: parseEngineConfig(new URL(c.req.url).searchParams),
      searchType: (c.req.query("type") || "web") as SearchType,
      page: parsePage(c.req.query("page")),
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

    let body: RetryPostBody;
    try {
      body = await c.req.json<RetryPostBody>();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    const query = body.query ?? "";
    const engineName = body.engine ?? "";
    if (!query || !engineName)
      return c.json({ error: "Missing 'query' or 'engine' parameter" }, 400);

    const result = await handleRetry({
      query,
      engineName,
      engines: parseEnginesFromBody(body.engines),
      searchType: (body.type || "web") as SearchType,
      page: parsePage(body.page),
      timeFilter: (body.time || "any") as TimeFilter,
      lang: body.lang || "",
      dateFrom: body.dateFrom || "",
      dateTo: body.dateTo || "",
    });

    return c.json(result);
  });
}
