import { idbDel, idbGet, idbSet } from "./db";
import { saveSyncedDefaults } from "./settings-api";
import { getStoredToken } from "./settings-token";
import { SYNC_KEYS, isValidSyncValue } from "../../shared/sync";

declare global {
  interface Window {
    __DEGOOG_SYNCED_DEFAULTS__?: Record<string, unknown>;
  }
}

export const applyDefaults = async (): Promise<void> => {
  const defaults = window.__DEGOOG_SYNCED_DEFAULTS__;
  if (!defaults) return;
  try {
    for (const key of SYNC_KEYS) {
      const value = defaults[key];
      if (value === undefined || value === null) continue;
      if (!isValidSyncValue(key, value)) continue;
      if ((await idbGet<unknown>(key)) !== null) continue;
      await idbSet(key, value);
    }
  } catch (err) {
    console.warn("[sync] could not apply synced defaults", err);
  }
};

export const resetDefaults = async (
  keys: readonly string[],
): Promise<void> => {
  const defaults = window.__DEGOOG_SYNCED_DEFAULTS__ ?? {};
  for (const key of keys) {
    const value = defaults[key];
    if (value === undefined || value === null || !isValidSyncValue(key, value)) {
      await idbDel(key);
    } else {
      await idbSet(key, value);
    }
  }
};

export const saveDefaults = async (): Promise<boolean> => {
  const blob: Record<string, unknown> = {};
  for (const key of SYNC_KEYS) {
    const value = await idbGet<unknown>(key);
    if (value !== null && value !== undefined) blob[key] = value;
  }
  return saveSyncedDefaults(blob, getStoredToken);
};
