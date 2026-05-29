import type { Statement } from "bun:sqlite";
import type { IndexRow } from "./recorders";
import { getDbForType, discoverTypes } from "./db";
import { getIndexerConfig } from "./config";
import { runPrune } from "./prune";
import { createMutex, type RunExclusive } from "../utils/mutex";
import { logger } from "../utils/logger";

export const FLUSH_INTERVAL_MS = 3_000;
export const PRUNE_INTERVAL_MS = 5 * 60_000;

const _pending = new Map<string, IndexRow[]>();
const _mutexes = new Map<string, RunExclusive>();
const _upsertUrlStmts = new Map<string, Statement>();
const _upsertHitStmts = new Map<string, Statement>();

let _flushTimer: ReturnType<typeof setInterval> | null = null;
let _pruneTimer: ReturnType<typeof setInterval> | null = null;

export let _knownTypes: string[] | null = null;
export const invalidateTypes = (): void => {
  _knownTypes = null;
};

export const mutexFor = (type: string): RunExclusive => {
  let m = _mutexes.get(type);
  if (!m) {
    m = createMutex();
    _mutexes.set(type, m);
  }
  return m;
};

const UPSERT_URL = `
  INSERT INTO urls (
    url_norm, url, source_engine, title, snippet,
    thumbnail, image_url, is_gif, duration, extras_json,
    first_seen, last_seen
  ) VALUES (
    $url_norm, $url, $source_engine, $title, $snippet,
    $thumbnail, $image_url, $is_gif, $duration, $extras_json,
    $first_seen, $last_seen
  )
  ON CONFLICT(url_norm) DO UPDATE SET
    last_seen = excluded.last_seen,
    title = CASE WHEN length(urls.title) >= length(excluded.title) THEN urls.title ELSE excluded.title END,
    snippet = CASE WHEN length(urls.snippet) >= length(excluded.snippet) THEN urls.snippet ELSE excluded.snippet END,
    thumbnail = COALESCE(urls.thumbnail, excluded.thumbnail),
    image_url = COALESCE(urls.image_url, excluded.image_url),
    is_gif = COALESCE(urls.is_gif, excluded.is_gif),
    duration = COALESCE(urls.duration, excluded.duration),
    extras_json = COALESCE(urls.extras_json, excluded.extras_json)
  RETURNING id
`;

const UPSERT_HIT = `
  INSERT INTO query_hits (query_norm, engine_type, url_id, first_seen, last_seen)
  VALUES ($query_norm, $engine_type, $url_id, $first_seen, $last_seen)
  ON CONFLICT(query_norm, engine_type, url_id) DO UPDATE SET
    last_seen = excluded.last_seen
`;

const getStmts = (type: string): { upsertUrl: Statement; upsertHit: Statement } => {
  const db = getDbForType(type);
  let upsertUrl = _upsertUrlStmts.get(type);
  if (!upsertUrl) {
    upsertUrl = db.prepare(UPSERT_URL);
    _upsertUrlStmts.set(type, upsertUrl);
  }
  let upsertHit = _upsertHitStmts.get(type);
  if (!upsertHit) {
    upsertHit = db.prepare(UPSERT_HIT);
    _upsertHitStmts.set(type, upsertHit);
  }
  return { upsertUrl, upsertHit };
};

const writeRow = (
  upsertUrl: Statement,
  upsertHit: Statement,
  row: IndexRow,
  now: number,
): void => {
  const urlIdRow = upsertUrl.get({
    $url_norm: row.url_norm,
    $url: row.url,
    $source_engine: row.source_engine,
    $title: row.title,
    $snippet: row.snippet,
    $thumbnail: row.thumbnail,
    $image_url: row.image_url,
    $is_gif: row.is_gif,
    $duration: row.duration,
    $extras_json: row.extras_json,
    $first_seen: now,
    $last_seen: now,
  }) as { id: number };

  upsertHit.run({
    $query_norm: row.query_norm,
    $engine_type: row.engine_type,
    $url_id: urlIdRow.id,
    $first_seen: now,
    $last_seen: now,
  });
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

const flushType = (type: string, rows: IndexRow[]): Promise<void> =>
  mutexFor(type)(async () => {
    try {
      const db = getDbForType(type);
      const { upsertUrl, upsertHit } = getStmts(type);
      const now = Date.now();
      const tx = db.transaction((batch: IndexRow[]) => {
        for (const row of batch) writeRow(upsertUrl, upsertHit, row, now);
      });
      tx(rows);
      invalidateTypes();
    } catch (err) {
      logger.warn("indexer", `flush failed for type=${type}`, err);
    }
  });

export const flushQueue = async (): Promise<void> => {
  if (_pending.size === 0) return;
  const snapshot = new Map(_pending);
  _pending.clear();
  await Promise.all(
    Array.from(snapshot.entries()).map(([type, rows]) =>
      rows.length > 0 ? flushType(type, rows) : Promise.resolve(),
    ),
  );
};

export const prunePass = async (): Promise<void> => {
  const types = discoverTypes();
  if (types.length === 0) return;
  const cfg = await getIndexerConfig();
  await Promise.all(
    types.map((type) =>
      mutexFor(type)(async () => {
        try {
          const db = getDbForType(type);
          runPrune(db, cfg);
        } catch (err) {
          logger.warn("indexer", `scheduled prune failed for type=${type}`, err);
        }
      }),
    ),
  );
};

export const startQueue = (): void => {
  if (_flushTimer) return;
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
