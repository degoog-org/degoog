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
import { guardApiKey } from "../../utils/api-key-guard";
import { parseEnginesFromBody, parsePage } from "./_parsers";
import { handleRetry, handleSearch } from "./_search-handlers";

export function registerSearchRoutes(router: Hono): void {
  router.get("/api/search", async (c) => {
    const limitRes = await _applyRateLimit(c);
    if (limitRes) return limitRes;
    const authRes = await guardApiKey(c, "apiKeySearchEnabled");
    if (authRes) return authRes;

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
    const authRes = await guardApiKey(c, "apiKeySearchEnabled");
    if (authRes) return authRes;

    const contentType = c.req.header("content-type") ?? "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      let form: FormData;
      try {
        form = await c.req.formData();
      } catch {
        return c.json({ error: "Invalid form data" }, 400);
      }
      const query = (form.get("q") as string | null) ?? "";
      if (!isValidQuery(query))
        return c.json({ error: "Missing or invalid query parameter 'q'" }, 400);

      const result = await handleSearch({
        query,
        engines: parseEnginesFromBody(undefined),
        searchType: ((form.get("type") as string | null) || "web") as SearchType,
        page: parsePage(form.get("page")),
        timeFilter: ((form.get("time") as string | null) || "any") as TimeFilter,
        lang: (form.get("lang") as string | null) || "",
        dateFrom: (form.get("dateFrom") as string | null) || "",
        dateTo: (form.get("dateTo") as string | null) || "",
      });

      return c.json(result);
    }

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
    const authRes = await guardApiKey(c, "apiKeySearchEnabled");
    if (authRes) return authRes;

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
    const authRes = await guardApiKey(c, "apiKeySearchEnabled");
    if (authRes) return authRes;

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
