import { Hono } from "hono";
import { readObjectBody } from "../utils/hono";
import {
  isWizardDisabled,
  readServerSettings,
  writeServerSettings,
} from "../utils/settings/server-settings";
import { logger } from "../utils/logger";
import { isPublicInstance } from "../utils/public-instance";
import { settingsAuth } from "./_guards";

const router = new Hono();

router.get("/api/server-settings", async (c) => {
  try {
    if (isWizardDisabled()) return c.json({ wizard: true, disabled: true });
    if (isPublicInstance()) return c.json({ wizard: true });
    const s = await readServerSettings();
    return c.json({ wizard: s.wizard });
  } catch (err) {
    logger.error("route:server-settings", "GET failed", err);
    return c.json({ wizard: true }, 500);
  }
});

router.patch("/api/server-settings", settingsAuth(), async (c) => {
  try {
    const body = (await readObjectBody<Record<string, unknown>>(c)) ?? {};
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
