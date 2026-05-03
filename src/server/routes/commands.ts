import { Hono } from "hono";
import {
  getCommandsApiResponse,
  matchBangCommand,
  setCommandsLocale,
} from "../extensions/commands/registry";
import { searchSingleEngine } from "../search";
import type { TimeFilter } from "../types";
import { getLocale } from "../utils/hono";
import { logger } from "../utils/logger";
import { isDisabled } from "../utils/plugin-settings";
import { buildSignedProxyUrl } from "../utils/proxy-sign";
import { getClientIp } from "../utils/request";
import { injectScope, translateHTML } from "../utils/translation";

const router = new Hono();

router.get("/api/commands", async (c) => {
  const locale = getLocale(c);
  if (locale) setCommandsLocale(locale);
  return c.json(await getCommandsApiResponse());
});

router.get("/api/command", async (c) => {
  const q = c.req.query("q");
  if (!q) return c.json({ error: "Missing query parameter 'q'" }, 400);

  const match = matchBangCommand(q);
  if (!match) return c.json({ error: "Unknown command" }, 404);

  if (match.type === "command") {
    if (await isDisabled(match.commandId)) {
      return c.json({ error: "This plugin is disabled" }, 403);
    }
  }

  const page = Math.max(
    1,
    Math.min(10, Math.floor(Number(c.req.query("page"))) || 1),
  );
  const timeFilter = (c.req.query("time") || "any") as TimeFilter;

  if (match.type === "engine") {
    if (!match.query.trim())
      return c.json(
        { error: "Missing search query after engine shortcut" },
        400,
      );
    const { results, timing } = await searchSingleEngine(
      match.engineId,
      match.query,
      page,
      timeFilter,
    );
    return c.json({
      type: "engine",
      engineId: match.engineId,
      results: results.map((r, i) => ({
        ...r,
        score: Math.max(10 - i, 1),
        sources: [r.source],
      })),
      query: match.query,
      totalTime: timing.time,
      engineTimings: [timing],
      relatedSearches: [],
    });
  }

  const clientIp = getClientIp(c);

  const t0 = performance.now();

  const language = getLocale(c);
  if (language) match.command.t?.setLocale(language);

  const result = await match.command.execute(match.args, { clientIp, page, signProxyUrl: buildSignedProxyUrl });
  logger.debug(
    "plugin",
    `${match.command.trigger} executed in ${Math.round(performance.now() - t0)}ms`,
  );
  return c.json({
    type: "command",
    trigger: match.command.trigger,
    title: result.title,
    html: injectScope(
      match.command.t
        ? translateHTML(result.html, match.command.t)
        : result.html,
      `commands/${match.commandId}`,
    ),
    action: result.action,
    page,
    totalPages: result.totalPages ?? 1,
  });
});

export default router;
