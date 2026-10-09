import type { Context, Hono } from "hono";
import { readObjectBody } from "../../utils/hono";
import type { RetryPostBody, SearchBody } from "../../types/search";
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
import { parseSearchBody, parseSearchForm, parseSearchRequest } from "./parsers";
import { handleRetry, handleSearch } from "../../search/handlers";
import { logger } from "../../utils/logger";
import { publicBodyLimit } from "../_guards";
import { hasSearchInput, INVALID_IMAGE, rejectsImage } from "../../search/search-image";

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
      const { origQ: query, ...params } = parseSearchForm(form);
      if (!isValidQuery(query))
        return c.json({ error: "Missing or invalid query parameter 'q'" }, 400);

      const result = await handleSearch({ query, ...params });

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
    const parsed = parseSearchBody(body);
    if (rejectsImage(body, parsed)) return c.json(INVALID_IMAGE, 400);
    if (!hasSearchInput(query, parsed.image))
      return c.json({ error: "Missing or invalid query parameter 'q'" }, 400);

    const result = await handleSearch({ query, ...parsed });

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
    const parsed = parseSearchBody(body);
    if (rejectsImage(body, parsed)) return c.json(INVALID_IMAGE, 400);
    if (!hasSearchInput(query, parsed.image) || !engineName)
      return c.json({ error: "Missing 'query' or 'engine' parameter" }, 400);

    const result = await handleRetry({ query, engineName, ...parsed });

    return respond(c, result, body.format ?? c.req.query(SEARX_FORMAT_PARAM));
  });
}
