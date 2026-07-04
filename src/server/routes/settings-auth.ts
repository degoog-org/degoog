import { Hono, type Context } from "hono";
import { randomBytes } from "node:crypto";
import { getMiddleware } from "../extensions/middleware/registry";
import { asString, getSettings } from "../utils/plugin-settings";
import { getAdminPath, isPublicInstance } from "../utils/public-instance";
import { logger } from "../utils/logger";
import { getBasePath } from "../utils/base-url";
import { getClientIp, isHttpsRequest } from "../utils/request";
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
const GENERATED_PASSWORD = randomBytes(24).toString("base64url");

export const envTruthy = (name: string): boolean => {
  const value = (process.env[name] ?? "").trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
};

export const isDangerouslyNoPassword = (): boolean =>
  envTruthy("DEGOOG_DANGEROUSLY_NO_PASSWORD");

const _explicitPasswords = (): string[] => {
  const raw = process.env.DEGOOG_SETTINGS_PASSWORDS ?? "";
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
};

export const hasGeneratedDefaultSettingsPassword = (): boolean =>
  _explicitPasswords().length === 0 && !isDangerouslyNoPassword();

const _noColor = !!process.env.NO_COLOR;
const _ansi = (code: string): string => (_noColor ? "" : code);
const ANSI_BLUE = _ansi("\x1b[38;2;66;133;244m");
const ANSI_YELLOW = _ansi("\x1b[38;2;251;188;5m");
const ANSI_GREEN = _ansi("\x1b[38;2;52;168;83m");
const ANSI_BOLD = _ansi("\x1b[1m");
const ANSI_RESET = _ansi("\x1b[0m");
const ACCENT_BAR = `${ANSI_YELLOW}┃${ANSI_RESET}`;

const _barLine = (text = ""): string => ` ${ACCENT_BAR} ${text}`;

const _envVar = (name: string): string => `${ANSI_BLUE}${name}${ANSI_RESET}`;

const _authBanner = (title: string, lines: string[]): string =>
  [
    "",
    _barLine(`${ANSI_YELLOW}${ANSI_BOLD}${title}${ANSI_RESET}`),
    _barLine(),
    ...lines.map((line) => _barLine(line)),
    "",
  ].join("\n");

const _otherOptionLines = (): string[] => [
  "",
  "Other options:",
  `  - ${_envVar("DEGOOG_PUBLIC_INSTANCE=true")} runs a public instance and`,
  "    auto-locks sensitive admin actions.",
  `  - ${_envVar("DEGOOG_SETTINGS_PATH=<path>")} moves settings away from the`,
  "    default /settings (or /admin) URL.",
];

export function logSettingsPasswordStatus(): void {
  const explicit = _explicitPasswords();
  if (explicit.length > 0) return;
  if (isDangerouslyNoPassword()) {
    console.warn(
      _authBanner("Settings authentication is disabled", [
        `${_envVar("DEGOOG_DANGEROUSLY_NO_PASSWORD")} is enabled, so the settings`,
        "and admin areas are open. Only use this on a trusted local network.",
        ..._otherOptionLines(),
      ]),
    );
    return;
  }
  console.warn(
    _authBanner("Temporary settings password", [
      `${_envVar("DEGOOG_SETTINGS_PASSWORDS")} is not set, so Degoog generated a`,
      "one-off password for this run. Sign in to settings with:",
      "",
      `   ${ANSI_GREEN}${ANSI_BOLD}${GENERATED_PASSWORD}${ANSI_RESET}`,
      "",
      `Set ${_envVar("DEGOOG_SETTINGS_PASSWORDS")} to keep a stable password, or`,
      `set ${_envVar("DEGOOG_DANGEROUSLY_NO_PASSWORD=true")} to disable the gate.`,
      ..._otherOptionLines(),
    ]),
  );
}

const buildSessionCookie = (token: string, secure: boolean): string => {
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${TOKEN_TTL_MS / 1000}`,
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
};

const adminSettingsPath = (): string => {
  const base = getBasePath();
  const admin = getAdminPath();
  return base ? `${base}/${admin}` : `/${admin}`;
};

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

export function canBalrogPass(c: Context): string | undefined {
  const fromHeader = c.req.header("x-settings-token");
  if (fromHeader) {
    logger.debug("settings-auth", "token source: x-settings-token header");
    return fromHeader;
  }
  return getTokenFromCookie(c);
}

export async function guardSettingsRoute(
  c: Context,
  route: string,
): Promise<Response | null> {
  const token = canBalrogPass(c);
  const valid = await gandalf(token);
  if (!valid) {
    logger.debug("settings-auth", `401 on ${route}`);
    return c.json({ error: "You shall not pass!" }, 401);
  }
  return null;
}

export async function shouldServeSettingsGate(c: Context): Promise<boolean> {
  const required = await isAuthRequired();
  if (!required) return false;
  const token = canBalrogPass(c);
  const valid = await gandalf(token);
  return !valid;
}

function getPasswords(): string[] {
  const explicit = _explicitPasswords();
  if (explicit.length > 0) return explicit;
  if (isDangerouslyNoPassword()) return [];
  return [GENERATED_PASSWORD];
}

export function isPasswordRequired(): boolean {
  return getPasswords().length > 0;
}

export async function gandalf(token: string | undefined): Promise<boolean> {
  if (isPublicInstance() && !isPasswordRequired()) return false;
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
  if (!required)
    return c.json({
      required: false,
      valid: true,
      dangerouslyNoPassword: isDangerouslyNoPassword(),
      generatedDefaultPassword: false,
    });

  const token = canBalrogPass(c);
  if (await gandalf(token)) return c.json({ required: true, valid: true });

  const m = await getSelectedMiddlewareForSettingsGate();
  if (!m) {
    if (isPasswordRequired())
      return c.json({
        required: true,
        valid: false,
        generatedDefaultPassword: hasGeneratedDefaultSettingsPassword(),
        dangerouslyNoPassword: false,
      });
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
  if (!m) return c.redirect(adminSettingsPath());
  const result = await m.handle(c.req.raw, { route: "settings-auth-callback" });
  if (
    result !== null &&
    !(result instanceof Response) &&
    "redirect" in result
  ) {
    tokenStore.pruneExpired();
    const sessionToken = generateSettingsToken();
    tokenStore.set(sessionToken, Date.now() + TOKEN_TTL_MS);
    const cookie = buildSessionCookie(sessionToken, isHttpsRequest(c));
    return new Response(null, {
      status: 302,
      headers: { Location: result.redirect, "Set-Cookie": cookie },
    });
  }
  if (result instanceof Response) return result;
  return c.redirect(adminSettingsPath());
});

router.post("/api/settings/auth", async (c) => {
  if (isPublicInstance() && !isPasswordRequired())
    return c.json({ error: "You shall not pass!" }, 401);
  const ip = getClientIp(c) ?? "unknown";
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
  } catch (err) {
    logger.debug("settings-auth", "invalid JSON body on auth", err);
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
  const cookie = buildSessionCookie(token, isHttpsRequest(c));
  return c.json({ ok: true, token }, 200, {
    "Set-Cookie": cookie,
  });
});

export default router;
