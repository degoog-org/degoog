import { logger } from "../logger";
import { asString, type SettingValue } from "../settings/plugin-settings";
import { getInstanceSettings } from "../settings/server-settings";
import { addEntry, checkBlocked, resetCache } from "../filtering/blocklist";

const DEFAULT_BAN_HOURS = 72;

export const resolveBanHours = (raw: SettingValue | undefined): number => {
  const n = parseInt(asString(raw ?? ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_BAN_HOURS;
};

let _enabled: boolean | null = null;
let _cssCheck: boolean | null = null;
let _banHours: number | null = null;
let _initialized = false;

const reloadCache = async (): Promise<void> => {
  try {
    const settings = await getInstanceSettings();
    const v = asString(settings.honeypotEnabled ?? "");
    _enabled = v === "" || v === "true";
    const c = asString(settings.honeypotCssCheck ?? "");
    _cssCheck = c === "" || c === "true";
    _banHours = resolveBanHours(settings.honeypotBanDuration);
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

const PRIVATE_ADDR =
  /^(127\.|::1$|::ffff:127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::ffff:10\.|::ffff:172\.(1[6-9]|2\d|3[01])\.|::ffff:192\.168\.|f[cd][0-9a-f]{2}:|fe80:)/i;

export const blockIp = async (ip: string): Promise<void> => {
  if (PRIVATE_ADDR.test(ip)) {
    logger.warn(
      "bot-trap",
      `honeypot triggered from private/loopback address ${ip} - ban skipped to avoid blocking all users behind a reverse proxy. ` +
        "If your proxy does not forward X-Forwarded-For, set DEGOOG_DISTRUST_PROXY=0 to enable real IP detection.",
    );
    return;
  }
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
