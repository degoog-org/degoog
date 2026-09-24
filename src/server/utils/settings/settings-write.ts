import { asBoolean } from "./plugin-settings";
import {
  getInstanceSettings,
  setInstanceSettings,
  type ServerSettingValue,
} from "./server-settings";
import { SETTINGS_SCHEMA, coerceSetting } from "./settings-schema";
import {
  isDomainListKey,
  readDomainLists,
  writeDomainList,
} from "../filtering/domain-lists";
import {
  isIndexerListKey,
  readIndexerLists,
  writeIndexerList,
} from "../../indexer/config/lists";
import { syncBlocklist } from "../security/bot-trap";
import { startQueue, stopQueue } from "../../indexer/queue/queue";
import { ReloadMode, reloadSync } from "../../extensions/store/reload-sync";
import { COMPAT_SETTING_KEYS } from "../../extensions/compatibility-layer/registry";
import { ExtensionStoreType } from "../../types/extension";
import { OVERSIZED_TEXT_FIELDS } from "../../../shared/indexer";
import { SEARCH_LIST_FIELDS } from "../../../shared/settings-lists";
import { logger } from "../logger";
import { createMutex } from "../cache/mutex";

export type SettingsSaveResult = {
  ok: true;
  searxReloadFailed?: true;
  indexerStartFailed?: true;
};

export const LIST_FIELDS = [
  ...OVERSIZED_TEXT_FIELDS,
  ...SEARCH_LIST_FIELDS,
] as const;

export const isListField = (key: string): boolean =>
  isIndexerListKey(key) || isDomainListKey(key);

export const writeListField = async (
  key: string,
  value: string,
): Promise<void> => {
  if (isIndexerListKey(key)) await writeIndexerList(key, value);
  else if (isDomainListKey(key)) await writeDomainList(key, value);
};

export const savedBody = (
  reloaded: boolean,
  indexerUp = true,
): SettingsSaveResult => {
  const body: SettingsSaveResult = { ok: true };
  if (!reloaded) body.searxReloadFailed = true;
  if (!indexerUp) body.indexerStartFailed = true;
  return body;
};

export const reloadCompat = async (): Promise<boolean> => {
  try {
    await reloadSync(ExtensionStoreType.Engine, ReloadMode.Bust);
    return true;
  } catch (err) {
    logger.warn(
      "settings",
      "engine reload after a compatibility layer toggle failed",
      err,
    );
    return false;
  }
};

export const reconcileIndexerQueue = async (): Promise<boolean> => {
  const settings = await getInstanceSettings();
  if (!asBoolean(settings.degoogIndexerEnabled)) {
    await stopQueue();
    return true;
  }
  try {
    await startQueue();
    return true;
  } catch (err) {
    logger.error("indexer", "queue start failed", err);
    return false;
  }
};

const _schemaUpdates = (
  body: Record<string, string>,
): Record<string, string | boolean> => {
  const updates: Record<string, string | boolean> = {};
  for (const [key, def] of Object.entries(SETTINGS_SCHEMA)) {
    const raw = body[key];
    if (typeof raw !== "string") continue;
    if (isListField(key)) continue;
    updates[key] = coerceSetting(def, raw);
  }
  return updates;
};

const _compatToggled = (
  updates: Record<string, string | boolean>,
  existing: Record<string, ServerSettingValue>,
): boolean =>
  COMPAT_SETTING_KEYS.some(
    (key) =>
      key in updates && asBoolean(updates[key]) !== asBoolean(existing[key]),
  );

/**
 * @fccview here, for future headaches: Serializes settings mutations. 
 * Basically anything that is already running inside `applySettingsBatch`, 
 * including the `after` callback, mustn't take it again or it'll deadlock the write. 
 * Kinda stupid if you think about it, but I can't really think of a better way to do it. 
 * I guess you could use another mutex for the `after` callback, but that's just as stupid sooo... yeah, 
 * this is what we get instead.
 */
export const settingsLock = createMutex();

const _listSnapshot = async (
  body: Record<string, string>,
): Promise<Record<string, string>> => {
  const stored: Record<string, string> = {
    ...(await readIndexerLists()),
    ...(await readDomainLists()),
  };
  const snapshot: Record<string, string> = {};
  for (const key of LIST_FIELDS) {
    if (typeof body[key] === "string") snapshot[key] = stored[key] ?? "";
  }
  return snapshot;
};

const _persistListFields = async (
  body: Record<string, string>,
): Promise<void> => {
  for (const key of LIST_FIELDS) {
    const raw = body[key];
    if (typeof raw === "string") await writeListField(key, raw);
  }
};

const _rollback = async (
  scalars: Record<string, ServerSettingValue>,
  lists: Record<string, string>,
): Promise<void> => {
  try {
    await setInstanceSettings(scalars);
  } catch (err) {
    logger.error("settings", "could not roll back the settings file", err);
  }
  for (const [key, value] of Object.entries(lists)) {
    try {
      await writeListField(key, value);
    } catch (err) {
      logger.error("settings", `could not roll back the ${key} list`, err);
    }
  }
};

type AfterBatch = () => Promise<void>;

export const applySettingsBatch = async (
  body: Record<string, string>,
  after?: AfterBatch,
): Promise<SettingsSaveResult> => {
  const { updates, existing } = await settingsLock(async () => {
    const before = await getInstanceSettings();
    const lists = await _listSnapshot(body);
    const next = _schemaUpdates(body);
    try {
      await setInstanceSettings({ ...before, ...next });
      await _persistListFields(body);
      if (after) await after();
    } catch (err) {
      logger.error("settings", "settings write failed, rolling back", err);
      await _rollback(before, lists);
      throw err;
    }
    return { updates: next, existing: before };
  });
  await syncBlocklist();
  const indexerUp = await reconcileIndexerQueue();
  const toggled = _compatToggled(updates, existing);
  return savedBody(toggled ? await reloadCompat() : true, indexerUp);
};
