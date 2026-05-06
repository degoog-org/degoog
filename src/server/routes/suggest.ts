import { Hono } from "hono";
import type { SuggestPostBody } from "../types/search";
import { guardApiKey } from "../utils/api-key-guard";
import { DEGOOG_SETTINGS_ID } from "../utils/search";
import { asString, getSettings } from "../utils/plugin-settings";
import { checkRateLimit } from "../utils/rate-limit";
import { getClientIp } from "../utils/request";

async function _applySuggestRateLimit(c: Parameters<typeof getClientIp>[0]) {
  const settings = await getSettings(DEGOOG_SETTINGS_ID);
  if (asString(settings.rateLimitSuggestEnabled) !== "true") return null;
  const ip = getClientIp(c) ?? "unknown";
  const opts = {
    rateLimitEnabled: "true",
    rateLimitBurstWindow: asString(settings.rateLimitSuggestBurstWindow) || "20",
    rateLimitBurstMax: asString(settings.rateLimitSuggestBurstMax) || "60",
    rateLimitLongWindow: asString(settings.rateLimitSuggestLongWindow) || "60",
    rateLimitLongMax: asString(settings.rateLimitSuggestLongMax) || "120",
  };
  const result = checkRateLimit(ip, opts);
  if (!result.allowed && result.retryAfterSec !== undefined) {
    return (c as Parameters<typeof getClientIp>[0] & { json: Function }).json(
      { error: "Too many requests" },
      429,
      { "Retry-After": String(result.retryAfterSec) },
    );
  }
  return null;
}

const router = new Hono();

async function getSuggestions(query: string): Promise<string[]> {
  if (!query.trim()) return [];
  const encoded = encodeURIComponent(query);
  const [googleRes, ddgRes] = await Promise.allSettled([
    fetch(
      `https://suggestqueries.google.com/complete/search?client=firefox&q=${encoded}`,
    )
      .then((r) => r.arrayBuffer())
      .then((buf) => JSON.parse(new TextDecoder("iso-8859-1").decode(buf))),
    fetch(`https://duckduckgo.com/ac/?q=${encoded}&type=list`).then((r) =>
      r.json(),
    ),
  ]);
  const googleSuggestions: string[] =
    googleRes.status === "fulfilled"
      ? (googleRes.value as [unknown, string[]])[1] || []
      : [];
  const ddgSuggestions: string[] =
    ddgRes.status === "fulfilled"
      ? (ddgRes.value as [unknown, string[]])[1] || []
      : [];

  const seen = new Set<string>();
  const merged: string[] = [];
  const lower = query.toLowerCase();
  for (const s of [...googleSuggestions, ...ddgSuggestions]) {
    const key = String(s).toLowerCase();
    if (key !== lower && !seen.has(key)) {
      seen.add(key);
      merged.push(String(s));
    }
    if (merged.length >= 10) break;
  }
  return merged;
}

router.get("/api/suggest", async (c) => {
  const limitRes = await _applySuggestRateLimit(c);
  if (limitRes) return limitRes;
  const authRes = await guardApiKey(c, "apiKeySuggestEnabled");
  if (authRes) return authRes;
  const query = c.req.query("q") ?? "";
  return c.json(await getSuggestions(query));
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
  return c.json(await getSuggestions(body.query ?? ""));
});

router.get("/api/suggest/opensearch", async (c) => {
  const limitRes = await _applySuggestRateLimit(c);
  if (limitRes) return limitRes;
  const authRes = await guardApiKey(c, "apiKeySuggestEnabled");
  if (authRes) return authRes;
  const query = c.req.query("q") ?? "";
  const suggestions = await getSuggestions(query);
  return c.json([query, suggestions], 200, {
    "Content-Type": "application/x-suggestions+json",
  });
});

export default router;
