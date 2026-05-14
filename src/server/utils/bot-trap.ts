import { logger } from "./logger";
import { asString, getSettings, setSettings } from "./plugin-settings";

const SETTINGS_ID = "degoog-settings";

const _blocked = new Set<string>();
let _initialized = false;
let _enabled: boolean | null = null;

const reloadCache = async (): Promise<void> => {
  try {
    const settings = await getSettings(SETTINGS_ID);
    _blocked.clear();
    const raw = asString(settings.honeypotBlocklist ?? "");
    for (const ip of raw.split("\n").map((s) => s.trim()).filter(Boolean)) {
      _blocked.add(ip);
    }
    const v = asString(settings.honeypotEnabled ?? "");
    _enabled = v === "" || v === "true";
    _initialized = true;
  } catch (e) {
    logger.error(
      "bot-trap",
      `failed to load blocklist: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
};

export const syncBlocklist = async (): Promise<void> => {
  _initialized = false;
  _enabled = null;
  await reloadCache();
};

export const isBlocked = async (ip: string): Promise<boolean> => {
  if (!_initialized) await reloadCache();
  return _blocked.has(ip);
};

export const blockIp = async (ip: string): Promise<void> => {
  if (!_initialized) await reloadCache();
  if (_blocked.has(ip)) return;
  _blocked.add(ip);
  try {
    const settings = await getSettings(SETTINGS_ID);
    const existing = asString(settings.honeypotBlocklist ?? "");
    const lines = existing
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!lines.includes(ip)) {
      lines.push(ip);
      await setSettings(SETTINGS_ID, {
        ...settings,
        honeypotBlocklist: lines.join("\n"),
      });
    }
  } catch (e) {
    logger.error(
      "bot-trap",
      `failed to persist blocked IP ${ip}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
};

export const honeypotOn = async (): Promise<boolean> => {
  if (_enabled !== null) return _enabled;
  if (!_initialized) await reloadCache();
  return _enabled ?? true;
};
