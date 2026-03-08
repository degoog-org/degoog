import { Hono } from "hono";
import { matchBangCommand, getCommandsApiResponse } from "../commands/registry";
import { searchSingleEngine } from "../search";
import { getSettings } from "../plugin-settings";
import type { SearchType, TimeFilter } from "../types";

const router = new Hono();

router.get("/api/commands", async (c) => {
  return c.json(await getCommandsApiResponse());
});

router.get("/api/command", async (c) => {
  const q = c.req.query("q");
  if (!q) return c.json({ error: "Missing query parameter 'q'" }, 400);

  const match = matchBangCommand(q);
  if (!match) return c.json({ error: "Unknown command" }, 404);

  if (match.type === "command") {
    const settings = await getSettings(match.commandId);
    if (settings["disabled"] === "true") {
      return c.json({ error: "This plugin is disabled" }, 403);
    }
  }

  const page = Math.max(1, Math.min(10, Math.floor(Number(c.req.query("page"))) || 1));
  const timeFilter = (c.req.query("time") || "any") as TimeFilter;

  if (match.type === "engine") {
    if (!match.query.trim()) return c.json({ error: "Missing search query after engine shortcut" }, 400);
    const { results, timing } = await searchSingleEngine(match.engineId, match.query, page, timeFilter);
    return c.json({
      type: "engine",
      engineId: match.engineId,
      results: results.map((r, i) => ({ ...r, score: Math.max(10 - i, 1), sources: [r.source] })),
      query: match.query,
      totalTime: timing.time,
      engineTimings: [timing],
      relatedSearches: [],
      knowledgePanel: null,
      atAGlance: results.length > 0 && results[0].snippet
        ? { ...results[0], score: 10, sources: [results[0].source] }
        : null,
    });
  }

  const forwarded = c.req.header("x-forwarded-for");
  const realIp = c.req.header("x-real-ip");
  const bunIp = (c.env as { requestIP: (req: Request) => { address: string } })
    .requestIP(c.req.raw)?.address;
  const clientIp = forwarded ? forwarded.split(",")[0].trim() : realIp || bunIp || undefined;

  const result = await match.command.execute(match.args, { clientIp, page });
  return c.json({
    type: "command",
    trigger: match.command.trigger,
    title: result.title,
    html: result.html,
    action: result.action,
    page,
    totalPages: result.totalPages ?? 1,
  });
});

export default router;
