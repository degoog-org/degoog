import { readFile, writeFile } from "fs/promises";
import { Hono } from "hono";
import { outgoingFetch } from "../utils/outgoing";
import { defaultEnginesFile } from "../utils/paths";
import { asString, getSettings, setSettings } from "../utils/plugin-settings";
import { getRandomUserAgent } from "../utils/user-agents";
import { DEFAULT_LANGUAGES, DEGOOG_SETTINGS_ID } from "../utils/search";
import { getServerKeyHex, regenerateServerKey } from "../utils/server-key";
import { guardSettingsRoute, isPasswordRequired } from "./settings-auth";

const router = new Hono();

const GENERAL_ALLOWED_KEYS = [
  "proxyEnabled",
  "proxyUrls",
  "rateLimitEnabled",
  "rateLimitBurstWindow",
  "rateLimitBurstMax",
  "rateLimitLongWindow",
  "rateLimitLongMax",
  "languagesEnabled",
  "languages",
  "streamingEnabled",
  "streamingAutoRetry",
  "streamingMaxRetries",
  "postMethodEnabled",
  "defaultTheme",
  "domainBlockEnabled",
  "domainBlockList",
  "domainBlockUiEnabled",
  "domainReplaceEnabled",
  "domainReplaceList",
  "domainReplaceUiEnabled",
  "domainScoreEnabled",
  "domainScoreList",
  "domainScoreUiEnabled",
  "customCss",
  "apiKeySearchEnabled",
  "apiKeySuggestEnabled",
] as const;

const _normalizeHostname = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

const _splitLines = (raw: string): string[] =>
  raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

const _appendBlock = (existing: string, source: string): string => {
  const lines = _splitLines(existing);
  if (lines.includes(source)) return existing;
  lines.push(source);
  return lines.join("\n");
};

const _appendReplace = (
  existing: string,
  source: string,
  target: string,
): string => {
  const next = _splitLines(existing).filter((l) => {
    const [src] = l.split("->").map((s) => s.trim());
    return src !== source;
  });
  next.push(`${source} -> ${target}`);
  return next.join("\n");
};

const _upsertScore = (
  existing: string,
  source: string,
  score: number,
): string => {
  const next = _splitLines(existing).filter((l) => {
    const [src] = l.split("|").map((s) => s.trim());
    return src !== source;
  });
  next.push(`${source}|${score}`);
  return next.join("\n");
};

const IP_CHECK_URL = "https://api.ipify.org?format=json";
const IP_CHECK_TIMEOUT_MS = 8_000;

const fetchIp = async (useFn: typeof fetch): Promise<string | null> => {
  try {
    const res = await useFn(IP_CHECK_URL, {
      signal: AbortSignal.timeout(IP_CHECK_TIMEOUT_MS),
      headers: {
        "User-Agent": getRandomUserAgent(),
        Accept: "application/json,text/plain,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ip?: string };
    return data.ip ?? null;
  } catch {
    return null;
  }
};

router.get("/api/settings/streaming", async (c) => {
  const settings = await getSettings(DEGOOG_SETTINGS_ID);
  return c.json({
    enabled: asString(settings.streamingEnabled) === "true",
    autoRetry: asString(settings.streamingAutoRetry) === "true",
    maxRetries: parseInt(asString(settings.streamingMaxRetries) || "2", 10),
  });
});

router.get("/api/settings/languages", async (c) => {
  const settings = await getSettings(DEGOOG_SETTINGS_ID);
  if (asString(settings["languagesEnabled"] ?? "") !== "true") {
    return c.json({ languages: DEFAULT_LANGUAGES });
  }
  const raw = asString(settings["languages"] ?? "");
  const codes = raw
    .split(/[\n,]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z]{2,3}$/.test(s));
  return c.json({ languages: codes.length > 0 ? codes : DEFAULT_LANGUAGES });
});

router.get("/api/settings/general", async (c) => {
  const denied = await guardSettingsRoute(c, "GET /api/settings/general");
  if (denied) return denied;
  const settings = await getSettings(DEGOOG_SETTINGS_ID);
  return c.json(settings);
});

router.post("/api/settings/general", async (c) => {
  const denied = await guardSettingsRoute(c, "POST /api/settings/general");
  if (denied) return denied;
  let body: Record<string, string>;
  try {
    body = await c.req.json<Record<string, string>>();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const existing = await getSettings(DEGOOG_SETTINGS_ID);
  const updates: Record<string, string> = {};
  for (const key of GENERAL_ALLOWED_KEYS) {
    if (key in body && typeof body[key] === "string") {
      updates[key] = body[key];
    }
  }
  await setSettings(DEGOOG_SETTINGS_ID, { ...existing, ...updates });
  return c.json({ ok: true });
});

router.post("/api/settings/domain-action", async (c) => {
  const denied = await guardSettingsRoute(
    c,
    "POST /api/settings/domain-action",
  );
  if (denied) return denied;

  let body: {
    kind?: string;
    source?: string;
    target?: string;
    score?: number;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const kind = body.kind;
  const source = _normalizeHostname(body.source ?? "");
  if (!source) return c.json({ error: "Missing source" }, 400);

  const existing = await getSettings(DEGOOG_SETTINGS_ID);
  const updates: Record<string, string> = {};

  if (kind === "block") {
    if (asString(existing.domainBlockUiEnabled) !== "true") {
      return c.json({ error: "Forbidden" }, 403);
    }
    updates.domainBlockList = _appendBlock(
      asString(existing.domainBlockList),
      source,
    );
  } else if (kind === "replace") {
    if (asString(existing.domainReplaceUiEnabled) !== "true") {
      return c.json({ error: "Forbidden" }, 403);
    }
    const target = _normalizeHostname(body.target ?? "");
    if (!target) return c.json({ error: "Missing target" }, 400);
    updates.domainReplaceList = _appendReplace(
      asString(existing.domainReplaceList),
      source,
      target,
    );
  } else if (kind === "score") {
    if (asString(existing.domainScoreUiEnabled) !== "true") {
      return c.json({ error: "Forbidden" }, 403);
    }
    const score = Number(body.score);
    if (!Number.isFinite(score)) {
      return c.json({ error: "Invalid score" }, 400);
    }
    updates.domainScoreList = _upsertScore(
      asString(existing.domainScoreList),
      source,
      Math.trunc(score),
    );
  } else {
    return c.json({ error: "Invalid kind" }, 400);
  }

  await setSettings(DEGOOG_SETTINGS_ID, { ...existing, ...updates });
  return c.json({ ok: true });
});

router.get("/api/settings/api-key", async (c) => {
  if (!isPasswordRequired()) return c.json({ error: "Forbidden" }, 403);
  const denied = await guardSettingsRoute(c, "GET /api/settings/api-key");
  if (denied) return denied;
  const settings = await getSettings(DEGOOG_SETTINGS_ID);
  return c.json({
    key: getServerKeyHex() ?? "",
    searchEnabled: asString(settings.apiKeySearchEnabled) === "true",
    suggestEnabled: asString(settings.apiKeySuggestEnabled) === "true",
  });
});

router.post("/api/settings/api-key/regenerate", async (c) => {
  if (!isPasswordRequired()) return c.json({ error: "Forbidden" }, 403);
  const denied = await guardSettingsRoute(
    c,
    "POST /api/settings/api-key/regenerate",
  );
  if (denied) return denied;
  await regenerateServerKey();
  return c.json({ key: getServerKeyHex() ?? "" });
});

router.get("/api/settings/proxy-test", async (c) => {
  const denied = await guardSettingsRoute(c, "GET /api/settings/proxy-test");
  if (denied) return denied;

  const settings = await getSettings(DEGOOG_SETTINGS_ID);
  const enabled = asString(settings.proxyEnabled) === "true";
  const proxyUrls = asString(settings.proxyUrls);

  const directIp = await fetchIp(fetch);

  if (!enabled || !proxyUrls.trim()) {
    return c.json({
      enabled: false,
      directIp,
      proxyIp: null,
      match: null,
    });
  }

  const proxyIp = await fetchIp(outgoingFetch as typeof fetch);

  return c.json({
    enabled: true,
    directIp,
    proxyIp,
    match: directIp !== null && proxyIp !== null && directIp === proxyIp,
  });
});

router.get("/api/settings/appearance", async (c) => {
  const settings = await getSettings(DEGOOG_SETTINGS_ID);
  return c.json({
    theme: asString(settings.defaultTheme) || "system",
  });
});

router.get("/api/settings/default-engines", async (c) => {
  const denied = await guardSettingsRoute(
    c,
    "GET /api/settings/default-engines",
  );
  if (denied) return denied;
  try {
    const raw = await readFile(defaultEnginesFile(), "utf-8");
    return c.json(JSON.parse(raw));
  } catch {
    return c.json({});
  }
});

router.post("/api/settings/default-engines", async (c) => {
  const denied = await guardSettingsRoute(
    c,
    "POST /api/settings/default-engines",
  );
  if (denied) return denied;
  let body: Record<string, boolean>;
  try {
    body = await c.req.json<Record<string, boolean>>();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  await writeFile(defaultEnginesFile(), JSON.stringify(body, null, 2), "utf-8");
  return c.json({ ok: true });
});

export default router;
