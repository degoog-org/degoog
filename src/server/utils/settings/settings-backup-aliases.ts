import { readFile } from "fs/promises";
import { aliasesFile } from "../paths";
import { writeJsonAtomic } from "../storage/atomic-json";
import { logger } from "../logger";
import { isRecord } from "../../../shared/utils/is-record";
import { ReloadMode, reloadSync } from "../../extensions/store/reload-sync";
import { ExtensionStoreType } from "../../types/extension";

const TAG = "settings-backup";
const MAX_ALIAS_CHARS = 128;

export type AliasMap = Record<string, string>;

const _pairs = (value: Record<string, unknown>): AliasMap => {
  const out: AliasMap = {};
  for (const [alias, target] of Object.entries(value)) {
    if (typeof target !== "string") continue;
    const from = alias.trim();
    const to = target.trim();
    if (!from || !to) continue;
    if (from.length > MAX_ALIAS_CHARS || to.length > MAX_ALIAS_CHARS) continue;
    out[from] = to;
  }
  return out;
};

export const collectAliases = async (): Promise<AliasMap | null> => {
  try {
    const parsed: unknown = JSON.parse(await readFile(aliasesFile(), "utf-8"));
    return isRecord(parsed) ? _pairs(parsed) : null;
  } catch (err) {
    logger.debug(TAG, "no bang aliases file to export", err);
    return null;
  }
};

export const readAliases = (value: unknown): AliasMap | null =>
  isRecord(value) ? _pairs(value) : null;

export const applyAliases = async (aliases: AliasMap | null): Promise<number> => {
  if (!aliases) return 0;
  await writeJsonAtomic(aliasesFile(), aliases);
  await reloadSync(ExtensionStoreType.Plugin, ReloadMode.Refresh);
  return Object.keys(aliases).length;
};
