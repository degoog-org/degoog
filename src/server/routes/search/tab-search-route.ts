import type { Hono } from "hono";
import { getClientIp } from "../../utils/net/request";
import { _applyRateLimit } from "../../utils/search";
import { sanePage } from "../../search/page-counter";
import { logger } from "../../utils/logger";
import { handleTabSearch } from "../../search/tab-search";

export function registerTabSearchRoute(router: Hono): void {
  router.get("/api/tab-search", async (c) => {
    const limitRes = await _applyRateLimit(c);
    if (limitRes) return limitRes;
    const tabId = c.req.query("tab");
    const query = c.req.query("q");
    if (!tabId || !query?.trim())
      return c.json({ error: "Missing tab or q" }, 400);

    const page = sanePage(c.req.query("page"));
    const clientIp = getClientIp(c);

    try {
      const result = await handleTabSearch({ tabId, query, page, clientIp });
      if (!result) return c.json({ error: "Tab not found" }, 404);

      return c.json(result);
    } catch (err) {
      logger.error("tab-search", "tab search failed", err);
      return c.json({ error: "Tab search failed" }, 500);
    }
  });
}
