import { Hono } from "hono";
import { findPluginRoute } from "../extensions/plugin-routes/registry";
import { getSettings } from "../plugin-settings";
import { getPluginSettingsIds } from "../plugin-assets";

const router = new Hono();

router.all("/api/plugin/:pluginId/*", async (c) => {
  const pluginId = c.req.param("pluginId");
  const settingsIds = getPluginSettingsIds(pluginId);
  for (const sid of settingsIds) {
    const settings = await getSettings(sid);
    if (settings["disabled"] === "true") {
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
    const res = await route.handler(c.req.raw);
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
