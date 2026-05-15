import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { blocklistFile } from "./paths";
import { logger } from "./logger";

export type BlockEntry = { ip: string; time: string };

const HOURS_TO_MS = 3_600_000;

let _cache: BlockEntry[] | null = null;

const load = async (): Promise<BlockEntry[]> => {
  if (_cache !== null) return _cache;
  try {
    const raw = await readFile(blocklistFile(), "utf-8");
    _cache = JSON.parse(raw) as BlockEntry[];
  } catch {
    _cache = [];
  }
  return _cache;
};

const persist = async (entries: BlockEntry[]): Promise<void> => {
  const path = blocklistFile();
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(entries, null, 2), "utf-8");
    _cache = entries;
  } catch (e) {
    logger.error("blocklist", `failed to write: ${e instanceof Error ? e.message : String(e)}`);
  }
};

const isLive = (entry: BlockEntry, banHours: number): boolean => {
  if (banHours <= 0) return true;
  return Date.now() - new Date(entry.time).getTime() < banHours * HOURS_TO_MS;
};

const evict = async (entries: BlockEntry[], banHours: number): Promise<BlockEntry[]> => {
  const active = entries.filter(e => isLive(e, banHours));
  if (active.length !== entries.length) await persist(active);
  return active;
};

export const checkBlocked = async (ip: string, banHours: number): Promise<boolean> => {
  const entries = await load();
  const active = await evict(entries, banHours);
  return active.some(e => e.ip === ip);
};

export const listActive = async (banHours: number): Promise<BlockEntry[]> => {
  const entries = await load();
  return evict(entries, banHours);
};

export const addEntry = async (ip: string): Promise<void> => {
  const entries = await load();
  const updated = entries.filter(e => e.ip !== ip);
  await persist([...updated, { ip, time: new Date().toISOString() }]);
};

export const removeEntry = async (ip: string): Promise<void> => {
  const entries = await load();
  await persist(entries.filter(e => e.ip !== ip));
};

export const resetCache = (): void => {
  _cache = null;
};
