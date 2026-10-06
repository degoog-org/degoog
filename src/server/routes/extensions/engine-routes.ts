import { Hono } from "hono";
import {
  ENGINE_ROUTE_PREFIX,
  findEngineRoute,
  findEngineRouteEntry,
} from "../../extensions/engines/engine-routes";
import { logger } from "../../utils/logger";
import { isDisabled } from "../../utils/settings/plugin-settings";
import { routeSuffix } from "../../utils/net/route-path";
import { _applyRateLimit } from "../../utils/search";

const router = new Hono();

router.all(`${ENGINE_ROUTE_PREFIX}/:engineFolder/*`, async (c) => {
  const folder = c.req.param("engineFolder");
  const entry = findEngineRouteEntry(folder);
  if (!entry) return c.notFound();
  if (await isDisabled(entry.id)) {
    return c.json({ error: "This engine is disabled" }, 403);
  }
  const suffix = routeSuffix(c.req.path, `${ENGINE_ROUTE_PREFIX}/${folder}`);
  const method = c.req.method.toLowerCase();
  const route = findEngineRoute(entry, method, suffix);
  if (!route) return c.notFound();
  if (route.rateLimit) {
    const limited = await _applyRateLimit(c, `ext:${entry.id}:`);
    if (limited) return limited;
  }
  try {
    const t0 = performance.now();
    const res = await route.handler(c.req.raw);
    logger.debug(
      "engine",
      `${entry.id} ${method} ${suffix} executed in ${Math.round(performance.now() - t0)}ms`,
    );
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  } catch (err) {
    logger.error(`Engine route error [${entry.id}] ${method} ${suffix}:`, err);
    return c.json({ error: "Engine route failed" }, 500);
  }
});

export default router;
