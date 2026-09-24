import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getInstanceSettings, updateInstanceSettings } from "../settings/server-settings";
import { logger } from "../logger";

const API_SECRET_FIELD = "apiSecretKey";
const KEY_HEX_LEN = 64;

let _key: Buffer | null = null;

const _readStoredKey = async (): Promise<string | null> => {
  const settings = await getInstanceSettings();
  const v = settings[API_SECRET_FIELD];
  return typeof v === "string" && v.length === KEY_HEX_LEN ? v : null;
};

export async function initServerKey(): Promise<void> {
  const existing = await _readStoredKey();
  if (existing) {
    _key = Buffer.from(existing, "hex");
    return;
  }
  const generated = randomBytes(32);
  await updateInstanceSettings({ [API_SECRET_FIELD]: generated.toString("hex") });
  _key = generated;
}

export function signData(data: string): string {
  if (!_key) throw new Error("Server key not initialized");
  return createHmac("sha256", _key).update(data).digest("hex");
}

export const getServerKeyHex = (): string | null =>
  _key ? _key.toString("hex") : null;

export function verifyServerKeyHex(provided: string): boolean {
  if (!_key || provided.length !== 64) return false;
  if (!/^[0-9a-fA-F]{64}$/.test(provided)) return false;
  try {
    const a = Buffer.from(provided, "hex");
    if (a.length !== _key.length) return false;
    return timingSafeEqual(a, _key);
  } catch (err) {
    logger.debug("server-key", "verifyServerKeyHex failed", err);
    return false;
  }
}

export async function regenerateServerKey(): Promise<void> {
  const generated = randomBytes(32);
  await updateInstanceSettings({ [API_SECRET_FIELD]: generated.toString("hex") });
  _key = generated;
}

export function verifyData(data: string, sig: string): boolean {
  if (!_key) return false;
  try {
    const expected = Buffer.from(signData(data), "hex");
    const provided = Buffer.from(sig, "hex");
    if (expected.length !== provided.length) return false;
    return timingSafeEqual(expected, provided);
  } catch (err) {
    logger.debug("server-key", "verifyData failed", err);
    return false;
  }
}
