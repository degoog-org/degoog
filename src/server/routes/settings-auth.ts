import { Hono, type Context } from "hono";
import { getMiddleware } from "../extensions/middleware/registry";
import { asString, getSettings } from "../utils/plugin-settings";
import { isPublicInstance } from "../utils/public-instance";
import { logger } from "../utils/logger";
import {
  TOKEN_TTL_MS,
  checkAuthRate,
  generateSettingsToken,
  passwordMatches,
  recordAuthFailure,
  tokenStore,
} from "../utils/settings-tokens";

const router = new Hono();

const COOKIE_NAME = "settings-token";
const MIDDLEWARE_SETTINGS_ID = "middleware";
const SETTINGS_GATE_KEY = "settingsGate";

const _clientIp = (c: Context): string =>
  c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
  c.req.header("x-real-ip") ||
  "unknown";

function getTokenFromCookie(c: Context): string | undefined {
  const raw = c.req.header("cookie");
  if (!raw) {
    logger.debug("settings-auth", "no cookie header present");
    return undefined;
  }
  const match = raw
    .split(";")
    .find((s) => s.trim().startsWith(COOKIE_NAME + "="));
  if (!match) {
    logger.debug(
      "settings-auth",
      `cookie header present but '${COOKIE_NAME}' not found`,
    );
    return undefined;
  }
  const value = match.split("=")[1]?.trim();
  logger.debug(
    "settings-auth",
    `'${COOKIE_NAME}' cookie found (length: ${value?.length ?? 0})`,
  );
  return value || undefined;
}

export function getSettingsTokenFromRequest(c: Context): string | undefined {
  const fromHeader = c.req.header("x-settings-token");
  if (fromHeader) {
    logger.debug("settings-auth", "token source: x-settings-token header");
    return fromHeader;
  }
  const fromQuery = c.req.query("token");
  if (fromQuery) {
    logger.debug("settings-auth", "token source: query param");
    return fromQuery;
  }
  return getTokenFromCookie(c);
}

export async function guardSettingsRoute(
  c: Context,
  route: string,
): Promise<Response | null> {
  const token = getSettingsTokenFromRequest(c);
  const valid = await validateSettingsToken(token);
  if (!valid) {
    logger.debug("settings-auth", `401 on ${route}`);
    return c.json({ error: "Unauthorized" }, 401);
  }
  return null;
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

export function isPasswordRequired(): boolean {
  return getPasswords().length > 0;
}

export async function validateSettingsToken(
  token: string | undefined,
): Promise<boolean> {
  if (isPublicInstance()) return false;
  const required = await isAuthRequired();
  if (!required) return true;
  if (!token) {
    logger.debug("settings-auth", "token validation failed: no token provided");
    return false;
  }
  const expiresAt = tokenStore.get(token);
  if (!expiresAt) {
    logger.debug(
      "settings-auth",
      `token validation failed: token not found in store (${tokenStore.size()} active tokens)`,
    );
    return false;
  }
  if (Date.now() > expiresAt) {
    tokenStore.delete(token);
    logger.debug("settings-auth", "token validation failed: token expired");
    return false;
  }
  const ttlMs = expiresAt - Date.now();
  logger.debug(
    "settings-auth",
    `token valid (expires in ${Math.round(ttlMs / 1000 / 60)}m)`,
  );
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
  const required = await isAuthRequired();
  if (!required) return c.json({ required: false, valid: true });

  const token = getSettingsTokenFromRequest(c);
  if (await validateSettingsToken(token))
    return c.json({ required: true, valid: true });

  const m = await getSelectedMiddlewareForSettingsGate();
  if (!m) {
    if (isPasswordRequired()) return c.json({ required: true, valid: false });
    logger.warn(
      "settings-auth",
      "settingsGate references a middleware that is not loaded; refusing to grant access",
    );
    return c.json({
      required: true,
      valid: false,
      error: "auth-misconfigured",
    });
  }

  const result = await m.handle(c.req.raw, { route: "settings-auth" });
  if (result instanceof Response) return result;
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
    tokenStore.pruneExpired();
    const sessionToken = generateSettingsToken();
    tokenStore.set(sessionToken, Date.now() + TOKEN_TTL_MS);
    const sep = result.redirect.includes("?") ? "&" : "?";
    return c.redirect(`${result.redirect}${sep}token=${sessionToken}`);
  }
  if (result instanceof Response) return result;
  return c.redirect("/settings");
});

router.post("/api/settings/auth", async (c) => {
  if (isPublicInstance()) return c.json({ error: "Unauthorized" }, 401);
  const ip = _clientIp(c);
  const rate = checkAuthRate(ip);
  if (!rate.allowed) {
    logger.warn(
      "settings-auth",
      `auth rate-limited for ${ip} (retry in ${rate.retryAfter}s)`,
    );
    return c.json({ ok: false, error: "Too many attempts" }, 429, {
      "Retry-After": String(rate.retryAfter),
    });
  }
  const m = await getSelectedMiddlewareForSettingsGate();
  if (m) {
    const result = await m.handle(c.req.raw, { route: "settings-auth-post" });
    if (result instanceof Response) return result;
    return c.json({ ok: false, error: "Use the login flow" }, 400);
  }
  if (!isPasswordRequired()) return c.json({ ok: true, token: null });
  let body: { password?: string };
  try {
    body = await c.req.json<{ password?: string }>();
  } catch {
    recordAuthFailure(ip);
    return c.json({ ok: false }, 400);
  }
  const passwords = getPasswords();
  const candidate = typeof body.password === "string" ? body.password : "";
  if (!candidate || !passwordMatches(candidate, passwords)) {
    recordAuthFailure(ip);
    return c.json({ ok: false }, 401);
  }
  tokenStore.pruneExpired();
  const token = generateSettingsToken();
  tokenStore.set(token, Date.now() + TOKEN_TTL_MS);
  const cookie = `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${TOKEN_TTL_MS / 1000}`;
  return c.json({ ok: true, token }, 200, {
    "Set-Cookie": cookie,
  });
});

export default router;
