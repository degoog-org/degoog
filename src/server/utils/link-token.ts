import { timingSafeEqual } from "crypto";
import { blockIp } from "./bot-trap";
import { logger } from "./logger";
import { signData } from "./server-key";

const TOKEN_TTL_MS = 10 * 60 * 1000;
const PING_TTL_MS = 60 * 60 * 1000;
const STRIKE_LIMIT = 3;
const TS_HEX_LEN = 16;
const SIG_HEX_LEN = 32;
const TOKEN_LEN = TS_HEX_LEN + SIG_HEX_LEN;
const TOKEN_RE = new RegExp(`^[0-9a-f]{${TOKEN_LEN}}$`);

const _pings = new Map<string, number>();
const _strikes = new Map<string, number>();

export const mintToken = (): string => {
  const ts = Date.now().toString(16).padStart(TS_HEX_LEN, "0");
  const sig = signData(ts).slice(0, SIG_HEX_LEN);
  return `${ts}${sig}`;
};

export const verifyToken = (token: string): boolean => {
  if (!TOKEN_RE.test(token)) return false;
  const ts = token.slice(0, TS_HEX_LEN);
  const sig = token.slice(TS_HEX_LEN);
  const age = Date.now() - parseInt(ts, 16);
  if (age < 0 || age > TOKEN_TTL_MS) return false;
  const expected = signData(ts).slice(0, SIG_HEX_LEN);
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch (e) {
    logger.error("link-token", `verify error: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
};

export const ping = (ip: string): void => {
  _pings.set(ip, Date.now() + PING_TTL_MS);
  _strikes.delete(ip);
};

export const hasPinged = (ip: string): boolean => {
  const expiry = _pings.get(ip);
  if (expiry === undefined) return false;
  if (Date.now() > expiry) {
    _pings.delete(ip);
    return false;
  }
  return true;
};

export const strike = async (ip: string): Promise<void> => {
  const count = (_strikes.get(ip) ?? 0) + 1;
  if (count >= STRIKE_LIMIT) {
    logger.warn("link-token", `blocking ${ip} after ${count} unverified requests`);
    _strikes.delete(ip);
    await blockIp(ip);
    return;
  }
  _strikes.set(ip, count);
  logger.debug("link-token", `strike ${count}/${STRIKE_LIMIT} for ${ip}`);
};
