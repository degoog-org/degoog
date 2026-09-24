import {
  BACKUP_KIND,
  BACKUP_VERSION,
  MIN_BACKUP_VERSION,
  isRecord,
} from "../../../shared/settings-backup";
import { SETTINGS_SCHEMA } from "./settings-schema";
import { getInstanceSettings } from "./server-settings";
import { readIndexerLists } from "../../indexer/config/lists";
import { readDomainLists } from "../filtering/domain-lists";
import {
  collectExtensions,
  hasExtensions,
  readExtensionsBackup,
  type ExtensionsBackup,
} from "./settings-backup-extensions";
import {
  collectInstance,
  hasInstance,
  readInstance,
  type InstanceBackup,
} from "./settings-backup-instance";
import {
  collectAliases,
  readAliases,
  type AliasMap,
} from "./settings-backup-aliases";
import {
  collectSources,
  readSources,
  type ShortcutSource,
} from "./settings-backup-shortcuts";

export type BackupContents = {
  settings: Record<string, string>;
  instance: InstanceBackup;
  extensions: ExtensionsBackup;
  aliases: AliasMap | null;
  shortcutSources: ShortcutSource[];
};

type SettingsBackup = BackupContents & {
  kind: typeof BACKUP_KIND;
  version: number;
  exportedAt: string;
};

const _asText = (value: unknown): string | null => {
  if (typeof value === "string") return value;
  if (typeof value === "boolean" || typeof value === "number")
    return String(value);
  return null;
};

const _collectSettings = async (): Promise<Record<string, string>> => {
  const merged: Record<string, unknown> = {
    ...(await getInstanceSettings()),
    ...(await readIndexerLists()),
    ...(await readDomainLists()),
  };
  const out: Record<string, string> = {};
  for (const key of Object.keys(SETTINGS_SCHEMA)) {
    const value = _asText(merged[key]);
    if (value !== null) out[key] = value;
  }
  return out;
};

export const buildBackup = async (): Promise<SettingsBackup> => ({
  kind: BACKUP_KIND,
  version: BACKUP_VERSION,
  exportedAt: new Date().toISOString(),
  settings: await _collectSettings(),
  instance: await collectInstance(),
  extensions: await collectExtensions(),
  aliases: await collectAliases(),
  shortcutSources: await collectSources(),
});

const _knownVersion = (value: unknown): boolean =>
  Number.isInteger(value) &&
  (value as number) >= MIN_BACKUP_VERSION &&
  (value as number) <= BACKUP_VERSION;

const _readSettings = (value: unknown): Record<string, string> | null => {
  if (!isRecord(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!(key in SETTINGS_SCHEMA)) continue;
    const text = _asText(raw);
    if (text !== null) out[key] = text;
  }
  return out;
};

export const parseBackup = (body: unknown): BackupContents | null => {
  if (!isRecord(body)) return null;
  if (body.kind !== BACKUP_KIND || !_knownVersion(body.version)) return null;
  const settings = _readSettings(body.settings);
  if (!settings) return null;
  return {
    settings,
    instance: readInstance(body.instance),
    extensions: readExtensionsBackup(body.extensions),
    aliases: readAliases(body.aliases),
    shortcutSources: readSources(body.shortcutSources),
  };
};

export const isEmptyBackup = (contents: BackupContents): boolean =>
  Object.keys(contents.settings).length === 0 &&
  !hasInstance(contents.instance) &&
  !hasExtensions(contents.extensions) &&
  contents.aliases === null &&
  contents.shortcutSources.length === 0;
