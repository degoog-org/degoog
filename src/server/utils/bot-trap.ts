import { logger } from "./logger";
import { asString, getSettings } from "./plugin-settings";
import { addEntry, checkBlocked, resetCache } from "./blocklist";

const SETTINGS_ID = "degoog-settings";
const DEFAULT_BAN_HOURS = 0;

let _enabled: boolean | null = null;
let _cssCheck: boolean | null = null;
let _banHours: number | null = null;
let _initialized = false;

const reloadCache = async (): Promise<void> => {
  try {
    const settings = await getSettings(SETTINGS_ID);
    const v = asString(settings.honeypotEnabled ?? "");
    _enabled = v === "" || v === "true";
    const c = asString(settings.honeypotCssCheck ?? "");
    _cssCheck = c === "" || c === "true";
    const raw = parseInt(asString(settings.honeypotBanDuration ?? ""), 10);
    _banHours = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_BAN_HOURS;
    _initialized = true;
  } catch (e) {
    logger.error(
      "bot-trap",
      `failed to load settings: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
};

export const syncBlocklist = async (): Promise<void> => {
  _initialized = false;
  _enabled = null;
  _cssCheck = null;
  _banHours = null;
  resetCache();
  await reloadCache();
};

export const isBlocked = async (ip: string): Promise<boolean> => {
  if (!_initialized) await reloadCache();
  return checkBlocked(ip, _banHours ?? DEFAULT_BAN_HOURS);
};

export const blockIp = async (ip: string): Promise<void> => {
  await addEntry(ip);
};

export const honeypotOn = async (): Promise<boolean> => {
  if (_enabled !== null) return _enabled;
  if (!_initialized) await reloadCache();
  return _enabled ?? true;
};

export const cssCheckOn = async (): Promise<boolean> => {
  if (_cssCheck !== null) return _cssCheck;
  if (!_initialized) await reloadCache();
  return _cssCheck ?? true;
};
