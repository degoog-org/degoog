import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getSettings, setSettings } from "./plugin-settings";

const SETTINGS_ID = "degoog-api-secret";
const KEY_FIELD = "key";

let _key: Buffer | null = null;

export async function initServerKey(): Promise<void> {
  const stored = await getSettings(SETTINGS_ID);
  const existing = stored[KEY_FIELD];
  if (typeof existing === "string" && existing.length === 64) {
    _key = Buffer.from(existing, "hex");
    return;
  }
  const generated = randomBytes(32);
  await setSettings(SETTINGS_ID, { [KEY_FIELD]: generated.toString("hex") });
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
  } catch {
    return false;
  }
}

export async function regenerateServerKey(): Promise<void> {
  const generated = randomBytes(32);
  await setSettings(SETTINGS_ID, { [KEY_FIELD]: generated.toString("hex") });
  _key = generated;
}

export function verifyData(data: string, sig: string): boolean {
  if (!_key) return false;
  try {
    const expected = Buffer.from(signData(data), "hex");
    const provided = Buffer.from(sig, "hex");
    if (expected.length !== provided.length) return false;
    return timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}
