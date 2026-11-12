import { Hono, type Context } from "hono";
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
import { guardApiKey } from "../../utils/security/api-key-guard";
import { isSealedResult } from "../../utils/net/proxy-sign";
import type { SlotPlugin } from "../../types/extension";

const router = new Hono();

type SlotBody = { query?: string; type?: string; results?: ScoredResult[] };

const SLOT_CALLS_PER_SEARCH = 4;

const _guardSlotCall = async (c: Context): Promise<Response | null> =>
  (await _applyRateLimit(c, "slots:", SLOT_CALLS_PER_SEARCH)) ??
  (await guardApiKey(c, "apiKeySearchEnabled"));

const _sealedResults = (body: SlotBody): ScoredResult[] | undefined =>
  Array.isArray(body.results) ? body.results.filter(isSealedResult) : undefined;

const _requestedType = (raw: unknown): string =>
  typeof raw === "string" && raw.trim() ? raw.trim() : DEFAULT_SEARCH_TYPE;

const GLANCE_PENDING = "pending";

type GlanceRun = {
  query: string;
  clientIp?: string;
  results?: ScoredResult[];
  withResults: boolean;
  locale?: string;
  searchType: string;
};

const _runGlanceSlot = async (
  plugin: SlotPlugin,
  { query, clientIp, results, withResults, locale, searchType }: GlanceRun,
): Promise<SlotPanel | typeof GLANCE_PENDING | null> => {
  if (!plugin.id) {
    logger.warn(
      "slots",
      `Skipping slot plugin: missing id (name="${plugin.name}")`,
    );
    return null;
  }
  try {
    const slotSettingsId = plugin.settingsId ?? `slot-${plugin.id}`;
    const position = await slotPosition(plugin, slotSettingsId);
    if (position !== SlotPanelPosition.AtAGlance) return null;
    if (await isDisabled(slotSettingsId)) return null;
    if (!(await slotShowsOn(plugin, slotSettingsId, searchType))) return null;
    const ok = await Promise.resolve(plugin.trigger(query));
    if (!ok) return null;
    if (!withResults && plugin.waitForResults) return GLANCE_PENDING;
    const context = slotContext(clientIp, results, locale);
    const t0 = performance.now();
    const out = await plugin.execute(query, context);
    logger.debug(
      "plugin",
      `${plugin.id} executed in ${Math.round(performance.now() - t0)}ms`,
    );
    return toSlotPanel(plugin.id, plugin, out, locale, plugin.position);
  } catch (err) {
    logger.warn("plugin", `${plugin.id} slot failed`, err);
    return null;
  }
};

router.post("/api/slots", publicBodyLimit, async (c) => {
  const blocked = await _guardSlotCall(c);
  if (blocked) return blocked;
  const body = await readObjectBody<SlotBody>(c);
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
    withResults ? _sealedResults(body) : undefined,
    {
      excludePosition: SlotPanelPosition.AtAGlance,
      locale: getLocale(c),
      searchType: _requestedType(body.type),
    },
  );
  return c.json({ panels });
});

router.post("/api/slots/glance", publicBodyLimit, async (c) => {
  const blocked = await _guardSlotCall(c);
  if (blocked) return blocked;
  const body = await readObjectBody<SlotBody>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  if (!body.query || !body.query.trim()) {
    return c.json({ error: "Missing query or results" }, 400);
  }
  const withResults = "results" in body;
  if (withResults && !Array.isArray(body.results)) {
    return c.json({ error: "Missing query or results" }, 400);
  }
  const run: GlanceRun = {
    query: body.query.trim(),
    clientIp: getClientIp(c) ?? undefined,
    results: withResults ? _sealedResults(body) : undefined,
    withResults,
    locale: getLocale(c),
    searchType: _requestedType(body.type),
  };
  const runs = await Promise.all(getSlotPlugins().map((plugin) => _runGlanceSlot(plugin, run)));
  const panels = runs.filter((panel): panel is SlotPanel => panel !== null && panel !== GLANCE_PENDING);
  const pending = runs.includes(GLANCE_PENDING);
  return c.json({ panels, pending });
});

export default router;
