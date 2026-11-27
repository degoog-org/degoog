import type { Context, Hono } from "hono";
import { getClientIp } from "../../utils/net/request";
import { readObjectBody } from "../../utils/hono";
import { _applyRateLimit } from "../../utils/search";
import { guardApiKey } from "../../utils/security/api-key-guard";
import { logger } from "../../utils/logger";
import { handleTabSearch, type TabSearchRequest } from "../../search/tab-search";
import type { SearchBody } from "../../types/search";
import { parseSearchBody, parseSearchRequest } from "./parsers";
import { publicBodyLimit } from "../_guards";
import { gandalfAtTheGate } from "../settings/settings-auth";

type TabSearchBody = SearchBody & { tab?: string };

const _runTabSearch = async (
  c: Context,
  tabId: string | undefined,
  query: string | undefined,
  request: TabSearchRequest,
): Promise<Response> => {
  if (!tabId || !query?.trim())
    return c.json({ error: "Missing tab or q" }, 400);
  try {
    const result = await handleTabSearch({
      ...request,
      tabId,
      query,
      clientIp: getClientIp(c),
      authenticated: await gandalfAtTheGate(c),
    });
    if (!result) return c.json({ error: "Tab not found" }, 404);
    return c.json(result);
  } catch (err) {
    logger.error("tab-search", "tab search failed", err);
    return c.json({ error: "Tab search failed" }, 500);
  }
};

export function registerTabSearchRoute(router: Hono): void {
  router.get("/api/tab-search", async (c) => {
    const limitRes = await _applyRateLimit(c);
    if (limitRes) return limitRes;
    const authRes = await guardApiKey(c, "apiKeySearchEnabled");
    if (authRes) return authRes;
    const { origQ, searchType: _searchType, ...request } = parseSearchRequest(c);
    return _runTabSearch(c, c.req.query("tab"), origQ, request);
  });

  router.post("/api/tab-search", publicBodyLimit, async (c) => {
    const limitRes = await _applyRateLimit(c);
    if (limitRes) return limitRes;
    const authRes = await guardApiKey(c, "apiKeySearchEnabled");
    if (authRes) return authRes;
    const body = await readObjectBody<TabSearchBody>(c);
    if (!body) return c.json({ error: "Invalid JSON" }, 400);
    const { searchType: _searchType, ...request } = parseSearchBody(body);
    return _runTabSearch(c, body.tab, body.query, request);
  });
}
