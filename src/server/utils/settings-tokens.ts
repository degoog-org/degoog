import { readFile, writeFile, rename } from "fs/promises";
import { timingSafeEqual } from "crypto";
import { logger } from "./logger";
import { settingsTokensFile } from "./paths";

export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const _validTokens = new Map<string, number>();

let _persistTimer: ReturnType<typeof setTimeout> | null = null;
let _persisting = false;

const _persistNow = async (): Promise<void> => {
  if (_persisting) {
    if (!_persistTimer) schedulePersist();
    return;
  }
  _persisting = true;
  const file = settingsTokensFile();
  const tmp = `${file}.tmp`;
  try {
    const snapshot = Object.fromEntries(_validTokens);
    await writeFile(tmp, JSON.stringify(snapshot), "utf-8");
    await rename(tmp, file);
  } catch (e) {
    logger.warn(
      "settings-auth",
      `failed to persist tokens: ${e instanceof Error ? e.message : String(e)}`,
    );
  } finally {
    _persisting = false;
  }
};

export const schedulePersist = (): void => {
  if (_persistTimer) return;
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    void _persistNow();
  }, 200);
};

const _loadPersistedTokens = async (): Promise<void> => {
  try {
    const raw = await readFile(settingsTokensFile(), "utf-8");
    const data = JSON.parse(raw) as Record<string, number>;
    const now = Date.now();
    let loaded = 0;
    for (const [token, expiresAt] of Object.entries(data)) {
      if (typeof expiresAt === "number" && expiresAt > now) {
        _validTokens.set(token, expiresAt);
        loaded++;
      }
    }
    if (loaded > 0) {
      logger.debug("settings-auth", `restored ${loaded} persisted token(s)`);
    }
  } catch {}
};

void _loadPersistedTokens();

export const tokenStore = {
  get: (token: string): number | undefined => _validTokens.get(token),
  set: (token: string, expiresAt: number): void => {
    _validTokens.set(token, expiresAt);
    schedulePersist();
  },
  delete: (token: string): void => {
    if (_validTokens.delete(token)) schedulePersist();
  },
  size: (): number => _validTokens.size,
  pruneExpired: (): void => {
    const now = Date.now();
    let pruned = 0;
    for (const [token, expiresAt] of _validTokens) {
      if (now > expiresAt) {
        _validTokens.delete(token);
        pruned++;
      }
    }
    if (pruned > 0) schedulePersist();
  },
};

export const generateSettingsToken = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const _safeEqual = (a: string, b: string): boolean => {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
};

export const passwordMatches = (
  candidate: string,
  allowed: string[],
): boolean => {
  let matched = false;
  for (const p of allowed) {
    if (_safeEqual(candidate, p)) matched = true;
  }
  return matched;
};

const AUTH_RATE_WINDOW_MS = 60_000;
const AUTH_RATE_MAX_FAILURES = 10;
const _authAttempts = new Map<string, number[]>();

export const checkAuthRate = (
  ip: string,
): { allowed: boolean; retryAfter: number } => {
  const now = Date.now();
  const cutoff = now - AUTH_RATE_WINDOW_MS;
  const attempts = (_authAttempts.get(ip) ?? []).filter((t) => t >= cutoff);
  _authAttempts.set(ip, attempts);
  if (attempts.length >= AUTH_RATE_MAX_FAILURES) {
    const retryAfter = Math.ceil(
      (attempts[0] + AUTH_RATE_WINDOW_MS - now) / 1000,
    );
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }
  return { allowed: true, retryAfter: 0 };
};

export const recordAuthFailure = (ip: string): void => {
  const now = Date.now();
  const cutoff = now - AUTH_RATE_WINDOW_MS;
  const attempts = (_authAttempts.get(ip) ?? []).filter((t) => t >= cutoff);
  attempts.push(now);
  _authAttempts.set(ip, attempts);
};
