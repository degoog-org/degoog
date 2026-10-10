import { readFile } from "fs/promises";
import { defaultEnginesFile } from "../../utils/paths";
import { writeJsonAtomic } from "../../utils/storage/atomic-json";
import { removeSettings } from "../../utils/settings/plugin-settings";
import {
  readSyncedDefaults,
  writeSyncedDefaults,
} from "../../utils/settings/synced-settings";
import { logger } from "../../utils/logger";
import { forgetEngineHosts } from "./engine-hosts";
import { ENGINE_BANGS_FIELD, ENGINE_SYNC_KEYS } from "../../../shared/sync";
import { isRecord } from "../../../shared/utils/is-record";

const NS = "engine-purge";

const _strip = (map: unknown, ids: string[]): boolean => {
  if (!isRecord(map)) return false;
  const present = ids.filter((id) => id in map);
  for (const id of present) delete map[id];
  return present.length > 0;
};

const _purgeDefaultEngines = async (ids: string[]): Promise<void> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(defaultEnginesFile(), "utf-8"));
  } catch (err) {
    logger.debug(NS, "no default engines file to purge", err);
    return;
  }
  if (!isRecord(parsed)) return;
  const topLevel = _strip(parsed, ids);
  const bangs = _strip(parsed[ENGINE_BANGS_FIELD], ids);
  if (topLevel || bangs) await writeJsonAtomic(defaultEnginesFile(), parsed);
};

const _purgeSyncedDefaults = async (ids: string[]): Promise<void> => {
  const synced = await readSyncedDefaults();
  const stripped = ENGINE_SYNC_KEYS.filter((key) => _strip(synced[key], ids));
  if (stripped.length > 0) await writeSyncedDefaults(synced);
};

export const purgeEngineRefs = async (engineIds: string[]): Promise<void> => {
  await _purgeDefaultEngines(engineIds);
  await _purgeSyncedDefaults(engineIds);
  await forgetEngineHosts(engineIds);
};

export const purgeEngineSettings = async (engineIds: string[]): Promise<void> => {
  for (const id of engineIds) await removeSettings(id);
  await purgeEngineRefs(engineIds);
};
