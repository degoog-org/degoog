import { getInstanceSettings, updateInstanceSettings } from "./server-settings";
import {
  readSyncedDefaults,
  writeSyncedDefaults,
  type SyncedDefaults,
} from "./synced-settings";
import { isRecord } from "../../../shared/utils/is-record";

const TAB_ORDER_KEY = "engineTabsOrder";

export type InstanceBackup = {
  syncedDefaults: SyncedDefaults | null;
  engineTabsOrder: string[] | null;
};

const _strings = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? (value as string[])
    : null;

export const collectInstance = async (): Promise<InstanceBackup> => {
  const settings = await getInstanceSettings();
  return {
    syncedDefaults: await readSyncedDefaults(),
    engineTabsOrder: _strings(settings[TAB_ORDER_KEY]),
  };
};

export const readInstance = (value: unknown): InstanceBackup => {
  if (!isRecord(value)) return { syncedDefaults: null, engineTabsOrder: null };
  return {
    syncedDefaults: isRecord(value.syncedDefaults)
      ? (value.syncedDefaults as SyncedDefaults)
      : null,
    engineTabsOrder: _strings(value.engineTabsOrder),
  };
};

export const hasInstance = (backup: InstanceBackup): boolean =>
  backup.syncedDefaults !== null || backup.engineTabsOrder !== null;

export const applyInstance = async (
  backup: InstanceBackup,
): Promise<number> => {
  let applied = 0;
  if (backup.syncedDefaults) {
    await writeSyncedDefaults(backup.syncedDefaults);
    applied += 1;
  }
  if (backup.engineTabsOrder) {
    await updateInstanceSettings({ [TAB_ORDER_KEY]: backup.engineTabsOrder });
    applied += 1;
  }
  return applied;
};
