import type { IndexRow } from "../recorders";
import { getAdapter, bootAdapter } from "../db/factory";
import { discoverTypes } from "../db/lifecycle";
import { getIndexerConfig } from "../config/load";
import { createMutex, type RunExclusive } from "../../utils/mutex";
import { logger } from "../../utils/logger";

export const FLUSH_INTERVAL_MS = 3_000;
export const PRUNE_INTERVAL_MS = 5 * 60_000;

const _pending = new Map<string, IndexRow[]>();
const _mutexes = new Map<string, RunExclusive>();

let _flushTimer: ReturnType<typeof setInterval> | null = null;
let _pruneTimer: ReturnType<typeof setInterval> | null = null;

export const mutexFor = (type: string): RunExclusive => {
  let m = _mutexes.get(type);
  if (!m) {
    m = createMutex();
    _mutexes.set(type, m);
  }
  return m;
};

export const enqueue = (rows: IndexRow[]): void => {
  for (const row of rows) {
    let bucket = _pending.get(row.engine_type);
    if (!bucket) {
      bucket = [];
      _pending.set(row.engine_type, bucket);
    }
    bucket.push(row);
  }
};

const flushType = (type: string, rows: IndexRow[], rankingWindow: number): Promise<void> =>
  mutexFor(type)(async () => {
    try {
      await getAdapter().writeBatch(type, rows, Date.now(), rankingWindow);
    } catch (err) {
      logger.warn("indexer", `flush failed for type=${type}`, err);
    }
  });

export const flushQueue = async (): Promise<void> => {
  if (_pending.size === 0) return;
  const snapshot = new Map(_pending);
  _pending.clear();
  const { rankingWindow } = await getIndexerConfig();
  await Promise.all(
    Array.from(snapshot.entries()).map(([type, rows]) =>
      rows.length > 0 ? flushType(type, rows, rankingWindow) : Promise.resolve(),
    ),
  );
};

export const prunePass = async (): Promise<void> => {
  const types = discoverTypes();
  if (types.length === 0) return;
  const cfg = await getIndexerConfig();
  const adapter = getAdapter();
  await Promise.all(
    types.map((type) =>
      mutexFor(type)(async () => {
        try {
          await adapter.pruneType(type, cfg);
        } catch (err) {
          logger.warn("indexer", `scheduled prune failed for type=${type}`, err);
        }
      }),
    ),
  );
};

export const startQueue = async (): Promise<void> => {
  if (_flushTimer) return;
  await bootAdapter();
  _flushTimer = setInterval(() => void flushQueue(), FLUSH_INTERVAL_MS);
  _pruneTimer = setInterval(() => void prunePass(), PRUNE_INTERVAL_MS);
};

export const stopQueue = async (): Promise<void> => {
  if (_flushTimer) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }
  if (_pruneTimer) {
    clearInterval(_pruneTimer);
    _pruneTimer = null;
  }
  await flushQueue();
};
