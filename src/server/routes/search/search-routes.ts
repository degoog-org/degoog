import type { Context, Hono } from "hono";
import { readObjectBody } from "../../utils/hono";
import type {
  RetryPostBody,
  SearchBody,
  SearchType,
  TimeFilter,
} from "../../types/search";
import type { ScoredResult, SearchResponse } from "../../../shared/search-types";
import {
  isSearxFormat,
  SEARX_FORMAT_PARAM,
  toSearxDoc,
} from "../../extensions/compatibility-layer/searx/api-shape";
import { getInstanceSettings } from "../../utils/settings/server-settings";
import { asBoolean } from "../../utils/settings/plugin-settings";
import { _applyRateLimit, isValidQuery } from "../../utils/search";
import { guardApiKey } from "../../utils/security/api-key-guard";
import {
  LEGACY_SAFE_MODE_PARAM,
  parseEnginesFromBody,
  parseImageFilter,
  parseSearchBody,
  parseSearchRequest,
  SAFE_MODE_PARAM,
} from "./parsers";
import { sanePage } from "../../search/page-counter";
import { handleRetry, handleSearch } from "../../search/handlers";
import { logger } from "../../utils/logger";
import { publicBodyLimit } from "../_guards";

/**
 * @todo Remove this once openwebui merges my future pull request to add degoog specific search support.
 */
const openWebUIFix = <T extends { results: ScoredResult[] }>(r: T) => ({
  ...r,
  results: r.results.map((res) => ({ ...res, content: res.snippet })),
});

type Shapeable = Pick<SearchResponse, "results" | "engineTimings"> &
  Partial<Pick<SearchResponse, "query" | "type" | "relatedSearches">>;

const searxApiOn = async (): Promise<boolean> =>
  asBoolean((await getInstanceSettings()).searxApiEnabled);

const respond = async <T extends Shapeable>(
  c: Context,
  result: T,
  format?: string | null,
) => {
  if (isSearxFormat(format) && (await searxApiOn())) {
    return c.json(await toSearxDoc(result));
  }
  return c.json(openWebUIFix(result));
};

export function registerSearchRoutes(router: Hono): void {
  router.get("/api/search", async (c) => {
    const limitRes = await _applyRateLimit(c);
    if (limitRes) return limitRes;
    const authRes = await guardApiKey(c, "apiKeySearchEnabled");
    if (authRes) return authRes;

    const { origQ: query, ...params } = parseSearchRequest(c);
    if (!isValidQuery(query))
      return c.json({ error: "Missing or invalid query parameter 'q'" }, 400);

    const result = await handleSearch({ query, ...params });

    return respond(c, result, c.req.query(SEARX_FORMAT_PARAM));
  });

  router.post("/api/search", publicBodyLimit, async (c) => {
    const limitRes = await _applyRateLimit(c);
    if (limitRes) return limitRes;
    const authRes = await guardApiKey(c, "apiKeySearchEnabled");
    if (authRes) return authRes;

    const contentType = c.req.header("content-type") ?? "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      let form: FormData;
      try {
        form = await c.req.formData();
      } catch (err) {
        logger.debug("search", "invalid form data", err);
        return c.json({ error: "Invalid form data" }, 400);
      }
      const query = (form.get("q") as string | null) ?? "";
      if (!isValidQuery(query))
        return c.json({ error: "Missing or invalid query parameter 'q'" }, 400);

      const result = await handleSearch({
        query,
        engines: parseEnginesFromBody(undefined),
        searchType: ((form.get("type") as string | null) || "web") as SearchType,
        page: sanePage(form.get("page")),
        timeFilter: ((form.get("time") as string | null) || "any") as TimeFilter,
        lang: (form.get("lang") as string | null) || "",
        dateFrom: (form.get("dateFrom") as string | null) || "",
        dateTo: (form.get("dateTo") as string | null) || "",
        imageFilter: parseImageFilter(
          form.get("imgColor") as string | null,
          form.get("imgSize") as string | null,
          form.get("imgType") as string | null,
          form.get("imgLayout") as string | null,
          (form.get(SAFE_MODE_PARAM) ?? form.get(LEGACY_SAFE_MODE_PARAM)) as string | null,
        ),
      });

      return respond(
        c,
        result,
        (form.get(SEARX_FORMAT_PARAM) as string | null) ??
          c.req.query(SEARX_FORMAT_PARAM),
      );
    }

    const body = await readObjectBody<SearchBody>(c);
    if (!body) return c.json({ error: "Invalid JSON" }, 400);
    const query = body.query ?? "";
    if (!isValidQuery(query))
      return c.json({ error: "Missing or invalid query parameter 'q'" }, 400);

    const result = await handleSearch({ query, ...parseSearchBody(body) });

    return respond(c, result, body.format ?? c.req.query(SEARX_FORMAT_PARAM));
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

    const { origQ: _origQ, ...params } = parseSearchRequest(c);
    const result = await handleRetry({ query, engineName, ...params });

    return respond(c, result, c.req.query(SEARX_FORMAT_PARAM));
  });

  router.post("/api/search/retry", publicBodyLimit, async (c) => {
    const limitRes = await _applyRateLimit(c);
    if (limitRes) return limitRes;
    const authRes = await guardApiKey(c, "apiKeySearchEnabled");
    if (authRes) return authRes;

    const body = await readObjectBody<RetryPostBody>(c);
    if (!body) return c.json({ error: "Invalid JSON" }, 400);
    const query = body.query ?? "";
    const engineName = body.engine ?? "";
    if (!query || !engineName)
      return c.json({ error: "Missing 'query' or 'engine' parameter" }, 400);

    const result = await handleRetry({ query, engineName, ...parseSearchBody(body) });

    return respond(c, result, body.format ?? c.req.query(SEARX_FORMAT_PARAM));
  });
}
