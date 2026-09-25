import { stat } from "fs/promises";
import { resolve } from "path";
import { logger } from "../logger";

const NS = "module-cache";
const IS_WINDOWS = process.platform === "win32";
const QUERY_MARK = "?";

const _fingerprints = new Map<string, string>();

const normalizeKey = (path: string): string => {
  const slashed = path.replace(/\\/g, "/");
  return IS_WINDOWS ? slashed.toLowerCase() : slashed;
};

const fingerprint = async (file: string): Promise<string | null> => {
  try {
    const info = await stat(file);
    return `${info.mtimeMs}:${info.size}`;
  } catch (err) {
    logger.debug(NS, `cannot fingerprint ${file}`, err);
    return null;
  }
};

const isInScope = (key: string, scope: string, isDir: boolean): boolean => {
  const normalized = normalizeKey(key);
  if (isDir) return normalized.startsWith(`${scope}/`);
  return normalized === scope || normalized.startsWith(`${scope}${QUERY_MARK}`);
};

const obliviate = (scopePath: string, isDir: boolean): number => {
  const scope = normalizeKey(resolve(scopePath));
  let removed = 0;
  try {
    for (const key of Object.keys(require.cache)) {
      if (!isInScope(key, scope, isDir)) continue;
      delete require.cache[key];
      removed++;
    }
  } catch (err) {
    logger.error(NS, `failed to evict cached modules for ${scopePath}`, err);
  }
  return removed;
};

export const refreshModules = async (
  entryFile: string,
  scopePath: string,
  evict: boolean,
): Promise<void> => {
  const current = await fingerprint(entryFile);
  if (!current) return;

  const key = normalizeKey(resolve(entryFile));
  const previous = _fingerprints.get(key);

  if (!previous) {
    _fingerprints.set(key, current);
    return;
  }
  if (!evict || previous === current) return;

  const isDir = resolve(scopePath) !== resolve(entryFile);
  const removed = obliviate(scopePath, isDir);
  _fingerprints.set(key, current);
  logger.debug(NS, `evicted ${removed} cached modules for ${scopePath}`);
};
