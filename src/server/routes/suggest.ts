import { Hono } from "hono";
import type { SuggestPostBody } from "../types/search";
import { guardApiKey } from "../utils/api-key-guard";
import { DEGOOG_SETTINGS_ID } from "../utils/search";
import { asString, getSettings } from "../utils/plugin-settings";
import { checkRateLimit } from "../utils/rate-limit";
import { getClientIp } from "../utils/request";
import { getSuggestionsFromProviders } from "../extensions/autocomplete/registry";

async function _applySuggestRateLimit(c: Parameters<typeof getClientIp>[0]) {
  const settings = await getSettings(DEGOOG_SETTINGS_ID);
  if (asString(settings.rateLimitSuggestEnabled) !== "true") return null;
  const ip = getClientIp(c) ?? "unknown";
  const opts = {
    rateLimitEnabled: "true",
    rateLimitBurstWindow:
      asString(settings.rateLimitSuggestBurstWindow) || "20",
    rateLimitBurstMax: asString(settings.rateLimitSuggestBurstMax) || "60",
    rateLimitLongWindow: asString(settings.rateLimitSuggestLongWindow) || "60",
    rateLimitLongMax: asString(settings.rateLimitSuggestLongMax) || "120",
  };
  const result = checkRateLimit(ip, opts);
  if (!result.allowed && result.retryAfterSec !== undefined) {
    return (
      c as Parameters<typeof getClientIp>[0] & {
        json: (
          body: unknown,
          status: number,
          headers: Record<string, string>,
        ) => Response;
      }
    ).json({ error: "Too many requests" }, 429, {
      "Retry-After": String(result.retryAfterSec),
    });
  }
  return null;
}

const router = new Hono();

router.get("/api/suggest", async (c) => {
  const limitRes = await _applySuggestRateLimit(c);
  if (limitRes) return limitRes;
  const authRes = await guardApiKey(c, "apiKeySuggestEnabled");
  if (authRes) return authRes;
  const query = c.req.query("q") ?? "";
  if (!query.trim()) return c.json([]);
  return c.json(await getSuggestionsFromProviders(query));
});

router.post("/api/suggest", async (c) => {
  const limitRes = await _applySuggestRateLimit(c);
  if (limitRes) return limitRes;
  const authRes = await guardApiKey(c, "apiKeySuggestEnabled");
  if (authRes) return authRes;
  let body: SuggestPostBody;
  try {
    body = await c.req.json<SuggestPostBody>();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const query = body.query ?? "";
  if (!query.trim()) return c.json([]);
  return c.json(await getSuggestionsFromProviders(query));
});

router.get("/api/suggest/opensearch", async (c) => {
  const limitRes = await _applySuggestRateLimit(c);
  if (limitRes) return limitRes;
  const authRes = await guardApiKey(c, "apiKeySuggestEnabled");
  if (authRes) return authRes;
  const query = c.req.query("q") ?? "";
  const results = await getSuggestionsFromProviders(query);
  return c.json([query, results.map((r) => r.text)], 200, {
    "Content-Type": "application/x-suggestions+json",
  });
});

export default router;
