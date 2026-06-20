import { Hono } from "hono";
import {
  readServerSettings,
  writeServerSettings,
} from "../utils/server-settings";
import { logger } from "../utils/logger";
import { isPublicInstance } from "../utils/public-instance";
import { canBalrogPass, gandalf } from "./settings-auth";

const router = new Hono();

router.get("/api/server-settings", async (c) => {
  try {
    if (isPublicInstance()) return c.json({ wizard: true });
    const s = await readServerSettings();
    return c.json({ wizard: s.wizard });
  } catch (err) {
    logger.error("route:server-settings", "GET failed", err);
    return c.json({ wizard: true }, 500);
  }
});

router.patch("/api/server-settings", async (c) => {
  if (!(await gandalf(canBalrogPass(c))))
    return c.json({ error: "You shall not pass!" }, 401);
  try {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: { wizard?: boolean } = {};
    if (typeof body.wizard === "boolean") patch.wizard = body.wizard;
    const next = await writeServerSettings(patch);
    return c.json({ wizard: next.wizard });
  } catch (err) {
    logger.error("route:server-settings", "PATCH failed", err);
    return c.json({ error: "failed to update server settings" }, 500);
  }
});

export default router;
