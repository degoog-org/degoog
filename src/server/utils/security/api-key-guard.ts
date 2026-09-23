import type { Context } from "hono";
import { asBoolean, didSettingsLoadFail } from "../settings/plugin-settings";
import { verifySearchNonce } from "./search-nonce";
import { verifyServerKeyHex } from "./server-key";
import { getInstanceSettings } from "../settings/server-settings";

const _verifyNonce = (c: Context): boolean => {
  const n = c.req.header("x-search-nonce") ?? c.req.query("searchNonce") ?? "";
  const s = c.req.header("x-search-sig") ?? c.req.query("searchSig") ?? "";
  return !!n && !!s && verifySearchNonce(n, s);
};

const _bearerMatches = (c: Context): boolean => {
  const raw =
    c.req.header("Authorization") ?? c.req.header("authorization") ?? "";
  const m = /^Bearer\s+(\S+)/i.exec(raw.trim());
  if (!m) return false;
  return verifyServerKeyHex(m[1]);
};

export async function guardApiKey(
  c: Context,
  settingKey: string,
): Promise<Response | null> {
  const settings = await getInstanceSettings();
  if (didSettingsLoadFail()) return c.json({ error: "You shall not pass!" }, 401);
  if (!asBoolean(settings[settingKey])) return null;
  if (_verifyNonce(c) || _bearerMatches(c)) return null;
  return c.json({ error: "You shall not pass!" }, 401);
}
