import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import type { Dirent } from "fs";
import { join } from "path";
import { shortcutsDir } from "../paths";
import { logger } from "../logger";
import {
  MAX_SHORTCUT_SOURCE_BYTES,
  isRecord,
  weigh,
} from "../../../shared/settings-backup";
import { ReloadMode, reloadSync } from "../../extensions/store/reload-sync";
import { ExtensionStoreType } from "../../types/extension";

const TAG = "settings-backup";
const SOURCE_NAME = /^[a-z0-9][a-z0-9-]*\.(js|mjs|cjs|ts)$/;

export type ShortcutSource = {
  name: string;
  source: string;
};

const _keepable = (name: string, source: string): boolean =>
  SOURCE_NAME.test(name) && weigh(source) <= MAX_SHORTCUT_SOURCE_BYTES;

export const collectSources = async (): Promise<ShortcutSource[]> => {
  const dir = shortcutsDir();
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    logger.debug(TAG, "no hand written shortcuts to export", err);
    return [];
  }
  const out: ShortcutSource[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !SOURCE_NAME.test(entry.name)) continue;
    try {
      const source = await readFile(join(dir, entry.name), "utf-8");
      if (_keepable(entry.name, source)) out.push({ name: entry.name, source });
      else logger.warn(TAG, `shortcut ${entry.name} is too big to export`);
    } catch (err) {
      logger.warn(TAG, `could not read shortcut ${entry.name}`, err);
    }
  }
  return out;
};

export const readSources = (value: unknown): ShortcutSource[] => {
  if (!Array.isArray(value)) return [];
  const out: ShortcutSource[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const { name, source } = entry;
    if (typeof name !== "string" || typeof source !== "string") continue;
    if (!_keepable(name, source)) {
      logger.warn(TAG, `skipping shortcut ${name} from a backup`);
      continue;
    }
    out.push({ name, source });
  }
  return out;
};

export const applySources = async (
  sources: ShortcutSource[],
): Promise<number> => {
  if (sources.length === 0) return 0;
  const dir = shortcutsDir();
  await mkdir(dir, { recursive: true });
  let written = 0;
  for (const { name, source } of sources) {
    try {
      await writeFile(join(dir, name), source, "utf-8");
      written += 1;
    } catch (err) {
      logger.warn(TAG, `could not restore shortcut ${name}`, err);
    }
  }
  if (written > 0) await reloadSync(ExtensionStoreType.Shortcut, ReloadMode.Bust);
  return written;
};
