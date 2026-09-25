import { Hono } from "hono";
import { getSlotPlugins } from "../../extensions/slots/registry";
import {
  DEFAULT_SEARCH_TYPE,
  type ScoredResult,
  type SlotPanel,
  SlotPanelPosition,
} from "../../../shared/search-types";
import { getLocale, readObjectBody } from "../../utils/hono";
import { logger } from "../../utils/logger";
import { isDisabled } from "../../utils/settings/plugin-settings";
import { getClientIp } from "../../utils/net/request";
import { _applyRateLimit } from "../../utils/search";
import { runSlotPlugins, slotContext, slotPosition, toSlotPanel } from "../../extensions/slots/run";
import { slotShowsOn } from "../../utils/extension-support/slot-types";
import { publicBodyLimit } from "../_guards";

const router = new Hono();

const _requestedType = (raw: unknown): string =>
  typeof raw === "string" && raw.trim() ? raw.trim() : DEFAULT_SEARCH_TYPE;

router.post("/api/slots", publicBodyLimit, async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;
  const body = await readObjectBody<{ query?: string; type?: string; results?: ScoredResult[] }>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  if (!body.query || !body.query.trim()) return c.json({ panels: [] });
  const clientIp = getClientIp(c);
  const withResults = "results" in body;
  if (withResults && !Array.isArray(body.results)) {
    return c.json({ error: "Missing results" }, 400);
  }
  const panels = await runSlotPlugins(
    body.query.trim(),
    clientIp,
    withResults ? body.results : undefined,
    {
      excludePosition: SlotPanelPosition.AtAGlance,
      locale: getLocale(c),
      searchType: _requestedType(body.type),
    },
  );
  return c.json({ panels });
});

router.post("/api/slots/glance", publicBodyLimit, async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;
  const body = await readObjectBody<{ query?: string; type?: string; results?: ScoredResult[] }>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  if (!body.query || !body.query.trim()) {
    return c.json({ error: "Missing query or results" }, 400);
  }
  const withResults = "results" in body;
  if (withResults && !Array.isArray(body.results)) {
    return c.json({ error: "Missing query or results" }, 400);
  }
  const clientIp = getClientIp(c);
  const locale = getLocale(c);
  const searchType = _requestedType(body.type);
  const panels: SlotPanel[] = [];
  let pending = false;
  for (const plugin of getSlotPlugins()) {
    if (!plugin.id) {
      logger.warn(
        "slots",
        `Skipping slot plugin: missing id (name="${plugin.name}")`,
      );
      continue;
    }
    try {
      const slotSettingsId = plugin.settingsId ?? `slot-${plugin.id}`;
      const position = await slotPosition(plugin, slotSettingsId);
      if (position !== SlotPanelPosition.AtAGlance) continue;
      if (await isDisabled(slotSettingsId)) continue;
      if (!(await slotShowsOn(plugin, slotSettingsId, searchType))) continue;
      const ok = await Promise.resolve(plugin.trigger(body.query!.trim()));
      if (!ok) continue;
      if (!withResults && plugin.waitForResults) {
        pending = true;
        continue;
      }
      const context = slotContext(
        clientIp ?? undefined,
        withResults ? body.results : undefined,
        locale,
      );
      const t0 = performance.now();
      const out = await plugin.execute(body.query!.trim(), context);
      logger.debug(
        "plugin",
        `${plugin.id} executed in ${Math.round(performance.now() - t0)}ms`,
      );
      const panel = toSlotPanel(plugin.id, plugin, out, locale, plugin.position);
      if (panel) panels.push(panel);
    } catch (err) {
      logger.warn("plugin", `${plugin.id} slot failed`, err);
    }
  }
  return c.json({ panels, pending });
});

export default router;
