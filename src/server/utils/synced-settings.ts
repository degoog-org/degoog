import { getInstanceSettings, updateInstanceSettings } from "./server-settings";
import { logger } from "./logger";
import { SYNC_KEYS, isValidSyncValue } from "../../shared/sync";

export type SyncedDefaults = Record<string, unknown>;

const DEFAULTS_KEY = "syncedDefaults";

const _whitelist = (raw: SyncedDefaults): SyncedDefaults => {
  const out: SyncedDefaults = {};
  for (const key of SYNC_KEYS) {
    if (key in raw && isValidSyncValue(key, raw[key])) {
      out[key] = raw[key];
    }
  }
  return out;
};

export const readSyncedDefaults = async (): Promise<SyncedDefaults> => {
  const settings = await getInstanceSettings();
  const raw = settings[DEFAULTS_KEY];
  if (typeof raw !== "string" || raw.length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return _whitelist(parsed as SyncedDefaults);
    }
  } catch (err) {
    logger.warn("settings", `discarding corrupt syncedDefaults: ${String(err)}`);
  }
  return {};
};

export const writeSyncedDefaults = async (
  raw: SyncedDefaults,
): Promise<SyncedDefaults> => {
  const next = _whitelist(raw);
  await updateInstanceSettings({ [DEFAULTS_KEY]: JSON.stringify(next) });
  return next;
};
