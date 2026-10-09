import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { logger } from "../../../utils/logger";
import { writeJsonAtomic } from "../../../utils/storage/atomic-json";
import { isRecord } from "../../../../shared/utils/is-record";
import type { SearxCatalogEntry } from "./catalog-types";
import { searxEnginesDir } from "./paths";
import { PythonLib } from "./python-deps";

const NS = "searx-custom";
const STORE_FILE = "custom-engines.json";

export interface SearxCustomEntry extends SearxCatalogEntry {
  source: string;
}

const _storePath = (): string => join(resolve(searxEnginesDir()), STORE_FILE);

const _strings = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [];

const _libs = (raw: unknown): PythonLib[] => {
  const known = new Set<string>(Object.values(PythonLib));
  return _strings(raw).filter((lib): lib is PythonLib => known.has(lib));
};

const _asEntry = (raw: unknown): SearxCustomEntry | null => {
  if (!isRecord(raw)) return null;
  const { code, name, source, site } = raw;
  if (typeof code !== "string" || typeof name !== "string" || typeof source !== "string") {
    return null;
  }
  return {
    code,
    name,
    source,
    types: _strings(raw.types),
    deps: _strings(raw.deps),
    libs: _libs(raw.libs),
    ...(typeof site === "string" && site ? { site } : {}),
  };
};

const _read = (): SearxCustomEntry[] => {
  const path = _storePath();
  if (!existsSync(path)) return [];
  const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
  if (!Array.isArray(parsed)) throw new Error(`${STORE_FILE} is not a list`);
  return parsed.map(_asEntry).filter((entry): entry is SearxCustomEntry => entry !== null);
};

export const customEntries = (): SearxCustomEntry[] => {
  try {
    return _read();
  } catch (err) {
    logger.warn(NS, `could not read ${STORE_FILE}, ignoring hand-added engines`, err);
    return [];
  }
};

export const customEntry = (code: string): SearxCustomEntry | undefined =>
  customEntries().find((entry) => entry.code === code);

export const saveCustomEntry = async (entry: SearxCustomEntry): Promise<void> => {
  const rest = _read().filter((other) => other.code !== entry.code);
  await writeJsonAtomic(_storePath(), [...rest, entry]);
};

export const dropCustomEntry = async (code: string): Promise<void> => {
  const all = _read();
  if (!all.some((entry) => entry.code === code)) return;
  await writeJsonAtomic(_storePath(), all.filter((entry) => entry.code !== code));
};
