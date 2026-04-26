import { readFile, writeFile } from "fs/promises";
import { Hono, type Context } from "hono";
import { getMiddleware } from "../extensions/middleware/registry";
import { outgoingFetch } from "../utils/outgoing";
import { defaultEnginesFile } from "../utils/paths";
import { asString, getSettings, setSettings } from "../utils/plugin-settings";
import { isPublicInstance } from "../utils/public-instance";
import { getRandomUserAgent } from "../utils/user-agents";

const DEGOOG_SETTINGS_ID = "degoog-settings";

const router = new Hono();

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const COOKIE_NAME = "settings-token";
const validTokens = new Map<string, number>();
const MIDDLEWARE_SETTINGS_ID = "middleware";
const SETTINGS_GATE_KEY = "settingsGate";

function getTokenFromCookie(c: Context): string | undefined {
  const raw = c.req.header("cookie");
  if (!raw) return undefined;
  const match = raw
    .split(";")
    .find((s) => s.trim().startsWith(COOKIE_NAME + "="));
  if (!match) return undefined;
  const value = match.split("=")[1]?.trim();
  return value || undefined;
}

export function getSettingsTokenFromRequest(c: Context): string | undefined {
  return (
    c.req.header("x-settings-token") ??
    c.req.query("token") ??
    getTokenFromCookie(c)
  );
}

export async function shouldServeSettingsGate(c: Context): Promise<boolean> {
  const required = await isAuthRequired();
  if (!required) return false;
  const token = getSettingsTokenFromRequest(c);
  const valid = await validateSettingsToken(token);
  return !valid;
}

function getPasswords(): string[] {
  const raw = process.env.DEGOOG_SETTINGS_PASSWORDS ?? "";
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

function isPasswordRequired(): boolean {
  return getPasswords().length > 0;
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [token, expiresAt] of validTokens) {
    if (now > expiresAt) validTokens.delete(token);
  }
}

export async function validateSettingsToken(
  token: string | undefined,
): Promise<boolean> {
  if (isPublicInstance()) return false;
  const required = await isAuthRequired();
  if (!required) return true;
  if (!token) return false;
  const expiresAt = validTokens.get(token);
  if (!expiresAt || Date.now() > expiresAt) {
    if (expiresAt) validTokens.delete(token);
    return false;
  }
  return true;
}

async function getSelectedMiddlewareForSettingsGate(): Promise<
  ReturnType<typeof getMiddleware>
> {
  const settings = await getSettings(MIDDLEWARE_SETTINGS_ID);
  const value = asString(settings[SETTINGS_GATE_KEY]).trim();
  if (!value.startsWith("plugin:")) return null;
  const id = value.slice(7);
  return getMiddleware(id);
}

async function isAuthRequired(): Promise<boolean> {
  if (isPasswordRequired()) return true;
  const settings = await getSettings(MIDDLEWARE_SETTINGS_ID);
  const gate = asString(settings[SETTINGS_GATE_KEY]).trim();
  return !!gate;
}

router.get("/api/settings/auth", async (c) => {
  const m = await getSelectedMiddlewareForSettingsGate();
  if (!m) {
    if (!isPasswordRequired()) return c.json({ required: false, valid: true });
    const token = getSettingsTokenFromRequest(c);
    if (await validateSettingsToken(token))
      return c.json({ required: true, valid: true });
    return c.json({ required: true, valid: false });
  }
  const token = getSettingsTokenFromRequest(c);
  if (await validateSettingsToken(token))
    return c.json({ required: true, valid: true });
  const result = await m.handle(c.req.raw, { route: "settings-auth" });
  if (result instanceof Response) return result;
  if (result === null) {
    if (!isPasswordRequired()) return c.json({ required: false, valid: true });
    return c.json({ required: true, valid: false });
  }
  return c.json({ required: true, valid: false });
});

router.get("/api/settings/auth/callback", async (c) => {
  const m = await getSelectedMiddlewareForSettingsGate();
  if (!m) return c.redirect("/settings");
  const result = await m.handle(c.req.raw, { route: "settings-auth-callback" });
  if (
    result !== null &&
    !(result instanceof Response) &&
    "redirect" in result
  ) {
    pruneExpired();
    const sessionToken = generateToken();
    validTokens.set(sessionToken, Date.now() + TOKEN_TTL_MS);
    const sep = result.redirect.includes("?") ? "&" : "?";
    return c.redirect(`${result.redirect}${sep}token=${sessionToken}`);
  }
  if (result instanceof Response) return result;
  return c.redirect("/settings");
});

router.post("/api/settings/auth", async (c) => {
  if (isPublicInstance()) return c.json({ error: "Unauthorized" }, 401);
  const m = await getSelectedMiddlewareForSettingsGate();
  if (m) {
    const result = await m.handle(c.req.raw, { route: "settings-auth-post" });
    if (result instanceof Response) return result;
    return c.json({ ok: false, error: "Use the login flow" }, 400);
  }
  if (!isPasswordRequired()) return c.json({ ok: true, token: null });
  const body = await c.req.json<{ password?: string }>();
  const passwords = getPasswords();
  if (!body.password || !passwords.includes(body.password)) {
    return c.json({ ok: false }, 401);
  }
  pruneExpired();
  const token = generateToken();
  validTokens.set(token, Date.now() + TOKEN_TTL_MS);
  const cookie = `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${TOKEN_TTL_MS / 1000}`;
  return c.json({ ok: true, token }, 200, {
    "Set-Cookie": cookie,
  });
});

router.get("/api/settings/general", async (c) => {
  const token = getSettingsTokenFromRequest(c);
  if (!(await validateSettingsToken(token))) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const settings = await getSettings(DEGOOG_SETTINGS_ID);
  return c.json(settings);
});

router.post("/api/settings/general", async (c) => {
  const token = getSettingsTokenFromRequest(c);
  if (!(await validateSettingsToken(token))) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  let body: Record<string, string>;
  try {
    body = await c.req.json<Record<string, string>>();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const existing = await getSettings(DEGOOG_SETTINGS_ID);
  const allowed = [
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
    "domainReplaceEnabled",
    "domainReplaceList",
    "customCss",
  ];
  const updates: Record<string, string> = {};
  for (const key of allowed) {
    if (key in body && typeof body[key] === "string") {
      updates[key] = body[key];
    }
  }
  await setSettings(DEGOOG_SETTINGS_ID, { ...existing, ...updates });
  return c.json({ ok: true });
});

const IP_CHECK_URL = "https://api.ipify.org?format=json";
const IP_CHECK_TIMEOUT_MS = 8_000;

async function fetchIp(useFn: typeof fetch): Promise<string | null> {
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
}

router.get("/api/settings/proxy-test", async (c) => {
  const token = getSettingsTokenFromRequest(c);
  if (!(await validateSettingsToken(token))) {
    return c.json({ error: "Unauthorized" }, 401);
  }

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
  const token = getSettingsTokenFromRequest(c);
  if (!(await validateSettingsToken(token))) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  try {
    const raw = await readFile(defaultEnginesFile(), "utf-8");
    return c.json(JSON.parse(raw));
  } catch {
    return c.json({});
  }
});

router.post("/api/settings/default-engines", async (c) => {
  const token = getSettingsTokenFromRequest(c);
  if (!(await validateSettingsToken(token))) {
    return c.json({ error: "Unauthorized" }, 401);
  }
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
