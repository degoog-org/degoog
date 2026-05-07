import { Hono } from "hono";
import { getSlotPlugins } from "../extensions/slots/registry";
import {
  ScoredResult,
  SlotPanelPosition,
  SlotPanelResult,
  SlotPluginContext,
} from "../types";
import { createCache } from "../utils/cache";
import { getLocale } from "../utils/hono";
import { logger } from "../utils/logger";
import { outgoingFetch } from "../utils/outgoing";
import { isDisabled } from "../utils/plugin-settings";
import { buildSignedProxyUrl } from "../utils/proxy-sign";
import { getClientIp } from "../utils/request";
import { _applyRateLimit, runSlotPlugins } from "../utils/search";
import { injectScope, translateHTML } from "../utils/translation";

const router = new Hono();

router.post("/api/slots", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;
  let body: { query?: string; results?: ScoredResult[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  if (!body.query || !body.query.trim()) return c.json({ panels: [] });
  const clientIp = getClientIp(c);
  const panels = await runSlotPlugins(
    body.query.trim(),
    clientIp,
    body.results,
    {
      excludePosition: SlotPanelPosition.AtAGlance,
      locale: getLocale(c),
    },
  );
  return c.json({ panels });
});

router.post("/api/slots/glance", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;
  let body: { query?: string; results?: ScoredResult[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  if (!body.query || !Array.isArray(body.results)) {
    return c.json({ error: "Missing query or results" }, 400);
  }
  const clientIp = getClientIp(c);
  const locale = getLocale(c);
  const glancePlugins = getSlotPlugins().filter(
    (p) => p.position === SlotPanelPosition.AtAGlance,
  );
  const panels: SlotPanelResult[] = [];
  for (const plugin of glancePlugins) {
    if (!plugin.id) {
      logger.warn(
        "slots",
        `Skipping slot plugin: missing id (name="${plugin.name}")`,
      );
      continue;
    }
    try {
      const slotSettingsId = plugin.settingsId ?? `slot-${plugin.id}`;
      if (await isDisabled(slotSettingsId)) continue;
      const ok = await Promise.resolve(plugin.trigger(body.query!.trim()));
      if (!ok) continue;
      if (plugin.t && locale) plugin.t.setLocale(locale);
      const context: SlotPluginContext = {
        clientIp: clientIp ?? undefined,
        results: body.results,
        fetch: outgoingFetch as SlotPluginContext["fetch"],
        signProxyUrl: buildSignedProxyUrl,
        createCache,
      };
      const t0 = performance.now();
      const out = await plugin.execute(body.query!.trim(), context);
      logger.debug(
        "plugin",
        `${plugin.id} executed in ${Math.round(performance.now() - t0)}ms`,
      );
      if (!out.html || !out.html.trim()) continue;
      panels.push({
        id: plugin.id,
        title: out.title,
        html: injectScope(
          plugin.t ? translateHTML(out.html, plugin.t) : out.html,
          `slots/${plugin.id}`,
        ),
        position: plugin.position,
        gridSize: plugin.gridSize,
      });
    } catch (err) {
      logger.warn("plugin", `${plugin.id} slot failed`, err);
    }
  }
  return c.json({ panels });
});

export default router;
