import type { Context } from "hono";
import { asString, getSettings } from "./plugin-settings";
import { DEGOOG_SETTINGS_ID } from "./search";
import { verifySearchNonce } from "./search-nonce";
import { verifyServerKeyHex } from "./server-key";

const _verifyNonce = (c: Context): boolean => {
  const n = c.req.header("x-search-nonce") ?? c.req.query("searchNonce") ?? "";
  const s = c.req.header("x-search-sig") ?? c.req.query("searchSig") ?? "";
  return !!n && !!s && verifySearchNonce(n, s);
};

const _bearerMatches = (c: Context): boolean => {
  const raw = c.req.header("Authorization") ?? c.req.header("authorization") ?? "";
  const m = /^Bearer\s+(\S+)/i.exec(raw.trim());
  if (!m) return false;
  return verifyServerKeyHex(m[1]);
};

export async function guardApiKey(
  c: Context,
  settingKey: string,
): Promise<Response | null> {
  const settings = await getSettings(DEGOOG_SETTINGS_ID);
  if (asString(settings[settingKey]) !== "true") return null;
  if (_verifyNonce(c) || _bearerMatches(c)) return null;
  return c.json({ error: "Unauthorized" }, 401);
}
