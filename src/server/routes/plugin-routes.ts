import { Hono } from "hono";
import { findPluginRoute } from "../extensions/plugin-routes/registry";
import { debug } from "../utils/logger";
import { getPluginSettingsIds } from "../utils/plugin-assets";
import { isDisabled } from "../utils/plugin-settings";

const router = new Hono();

router.all("/api/plugin/:pluginId/*", async (c) => {
  const pluginId = c.req.param("pluginId");
  const settingsIds = getPluginSettingsIds(pluginId);
  for (const sid of settingsIds) {
    if (await isDisabled(sid)) {
      return c.json({ error: "This plugin is disabled" }, 403);
    }
  }
  const pathPrefix = `/api/plugin/${pluginId}`;
  const pathname = c.req.path;
  const suffix = pathname.startsWith(pathPrefix)
    ? pathname.slice(pathPrefix.length) || "/"
    : "/";
  const method = c.req.method.toLowerCase();
  const route = findPluginRoute(pluginId, method, suffix);

  if (!route) return c.notFound();
  try {
    const t0 = performance.now();
    const res = await route.handler(c.req.raw);

    debug(
      "plugin",
      `${pluginId} ${method} ${suffix} executed in ${Math.round(performance.now() - t0)}ms`,
    );

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  } catch (err) {
    console.error(`Plugin route error [${pluginId}] ${method} ${suffix}:`, err);
    return c.json({ error: "Plugin route failed" }, 500);
  }
});

export default router;
