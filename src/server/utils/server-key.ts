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
