import { Hono } from "hono";
import { getSettings } from "../utils/plugin-settings";
import { getClientIp } from "../utils/request";
import { checkRateLimit } from "../utils/rate-limit";

const DEGOOG_SETTINGS_ID = "degoog-settings";
const router = new Hono();

router.get("/api/rate-limit/test", async (c) => {
  if (process.env.LOG_LEVEL !== "debug") return;

  const settings = await getSettings(DEGOOG_SETTINGS_ID);
  const opts: Record<string, string> = {};
  for (const [k, v] of Object.entries(settings)) {
    opts[k] = typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? "") : "";
  }
  if (opts.rateLimitEnabled !== "true") {
    return c.json({ rateLimitEnabled: false });
  }
  const ip = getClientIp(c) ?? "unknown";
  const result = checkRateLimit(ip, opts);
  if (!result.allowed && result.retryAfterSec !== undefined) {
    return c.json(
      { allowed: false, retryAfterSec: result.retryAfterSec },
      429,
      { "Retry-After": String(result.retryAfterSec) },
    );
  }
  return c.json({ allowed: true });
});

export default router;
