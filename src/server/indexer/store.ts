import type { SearchResult } from "../types";
import type { Statement } from "bun:sqlite";
import { statSync } from "fs";
import { getIndexerConfig } from "./config";
import { getDbForType, discoverTypes, checkpointType } from "./db";
import { shouldIndex } from "./filters";
import { indexerDbForType } from "../utils/paths";
import { normalizeQuery } from "./normalize";
import { pruneOrphanUrls } from "./prune";
import { recorderFor } from "./recorders";
import { enqueue, mutexFor, invalidateTypes } from "./queue";
import { logger } from "../utils/logger";

export const DEGOOG_ENGINE_NAME = "Degoog";

const PROTO_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const STATS_TTL_MS = 10_000;

export interface IndexerStats {
  totalHits: number;
  totalUrls: number;
  totalQueries: number;
  byType: Record<string, number>;
  dbSizeBytes: number;
}

export interface ExportRow {
  query_norm: string;
  engine_type: string;
  url: string;
  url_norm: string;
  source_engine: string;
  title: string;
  snippet: string;
  thumbnail: string | null;
  image_url: string | null;
  is_gif: number | null;
  duration: string | null;
  extras_json: string | null;
  first_seen: number;
  last_seen: number;
  source_instance: string | null;
}

export interface HitRow {
  id: number;
  query_norm: string;
  engine_type: string;
  url: string;
  title: string;
  snippet: string;
  last_seen: number;
}

export interface DeleteItem {
  id: number;
  engine_type: string;
}

const FTS_ESCAPE = /["()]/g;

const escapeFtsTerm = (s: string): string =>
  `"${s.replace(FTS_ESCAPE, " ").trim()}"`;

const buildFtsQuery = (queryNorm: string): string => {
  const terms = queryNorm
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map(escapeFtsTerm);
  return terms.length > 0 ? terms.join(" OR ") : "";
};

const escapeLike = (s: string): string =>
  s.replace(/[\\%_]/g, (ch) => `\\${ch}`);

interface UrlRow {
  url: string;
  source_engine: string;
  title: string;
  snippet: string;
  thumbnail: string | null;
  image_url: string | null;
  is_gif: number | null;
  duration: string | null;
  extras_json: string | null;
}

const rowToResult = (row: UrlRow): SearchResult => {
  const base: SearchResult = {
    title: row.title,
    url: row.url,
    snippet: row.snippet,
    source: DEGOOG_ENGINE_NAME,
  };
  if (row.thumbnail) base.thumbnail = row.thumbnail;
  if (row.image_url) base.imageUrl = row.image_url;
  if (row.is_gif !== null) base.isGif = row.is_gif === 1;
  if (row.duration) base.duration = row.duration;
  if (row.extras_json) {
    try {
      const extras = JSON.parse(row.extras_json) as Record<string, unknown>;
      const target = base as unknown as Record<string, unknown>;
      for (const [k, v] of Object.entries(extras)) {
        if (PROTO_KEYS.has(k)) continue;
        target[k] = v;
      }
    } catch (err) {
      logger.debug("indexer", "extras_json parse failed", err);
    }
  }
  return base;
};

const _exactQs = new Map<string, Statement>();
const _fuzzyQs = new Map<string, Statement>();
const _listAllQs = new Map<string, Statement>();
const _listSearchQs = new Map<string, Statement>();
const _countAllQs = new Map<string, Statement>();
const _countSearchQs = new Map<string, Statement>();
const _sampleQs = new Map<string, Statement>();

let _statsCache: { data: IndexerStats; at: number } | null = null;

export const wipeStatsCache = (): void => {
  _statsCache = null;
};

const EXACT_SQL = `
  SELECT u.url, u.source_engine, u.title, u.snippet, u.thumbnail,
         u.image_url, u.is_gif, u.duration, u.extras_json
  FROM query_hits h
  JOIN urls u ON u.id = h.url_id
  WHERE h.query_norm = ? AND h.engine_type = ?
  ORDER BY h.last_seen DESC
  LIMIT ?
`;

const FUZZY_SQL = `
  SELECT u.url, u.source_engine, u.title, u.snippet, u.thumbnail,
         u.image_url, u.is_gif, u.duration, u.extras_json
  FROM urls_fts f
  JOIN urls u ON u.id = f.rowid
  JOIN query_hits h ON h.url_id = u.id
  WHERE urls_fts MATCH ?
    AND h.engine_type = ?
    AND h.query_norm != ?
  ORDER BY rank, h.last_seen DESC
  LIMIT ?
`;

const LIST_SELECT = `
  SELECT h.id, h.query_norm, h.engine_type, u.url, u.title, u.snippet, h.last_seen
  FROM query_hits h
  JOIN urls u ON u.id = h.url_id
`;

const SEARCH_WHERE = `
  WHERE h.query_norm LIKE $term ESCAPE '\\'
     OR u.url LIKE $term ESCAPE '\\'
     OR u.title LIKE $term ESCAPE '\\'
`;

const EXPORT_SQL = `
  SELECT h.query_norm, h.engine_type, u.url, u.url_norm, u.source_engine,
         u.title, u.snippet, u.thumbnail, u.image_url, u.is_gif, u.duration,
         u.extras_json, h.first_seen, h.last_seen, NULL AS source_instance
  FROM query_hits h
  JOIN urls u ON u.id = h.url_id
`;

export const recordResults = async (
  query: string,
  engineType: string,
  results: SearchResult[],
): Promise<void> => {
  if (!query || results.length === 0) return;
  const queryNorm = normalizeQuery(query);
  if (!queryNorm) return;
  const cfg = await getIndexerConfig();
  const allowed = results.filter((r) => shouldIndex(r, cfg));
  const capped =
    cfg.maxPerSearch > 0 ? allowed.slice(0, cfg.maxPerSearch) : allowed;
  const recorder = recorderFor(engineType);
  const rows = recorder.toRows(queryNorm, engineType, capped);
  if (rows.length > 0) enqueue(rows);
};

export const queryIndex = async (
  query: string,
  engineType: string,
  limit?: number,
): Promise<SearchResult[]> => {
  const queryNorm = normalizeQuery(query);
  if (!queryNorm) return [];
  const cfg = await getIndexerConfig();
  const cap = limit ?? cfg.queryLimit;
  try {
    const db = getDbForType(engineType);
    let exactQ = _exactQs.get(engineType);
    if (!exactQ) {
      exactQ = db.prepare(EXACT_SQL);
      _exactQs.set(engineType, exactQ);
    }
    const exact = exactQ.all(queryNorm, engineType, cap) as UrlRow[];
    const seen = new Set(exact.map((r) => r.url));
    const remaining = cap - exact.length;
    let fuzzy: UrlRow[] = [];
    if (remaining > 0 && cfg.fuzzyEnabled) {
      const ftsQuery = buildFtsQuery(queryNorm);
      if (ftsQuery) {
        let fuzzyQ = _fuzzyQs.get(engineType);
        if (!fuzzyQ) {
          fuzzyQ = db.prepare(FUZZY_SQL);
          _fuzzyQs.set(engineType, fuzzyQ);
        }
        fuzzy = fuzzyQ.all(ftsQuery, engineType, queryNorm, remaining) as UrlRow[];
      }
    }
    return [...exact, ...fuzzy.filter((r) => !seen.has(r.url))].map(rowToResult);
  } catch (err) {
    logger.warn("indexer", `queryIndex failed for type=${engineType}`, err);
    return [];
  }
};

export const getKnownTypes = (): string[] => discoverTypes();

export const getStats = (): IndexerStats => {
  if (_statsCache && Date.now() - _statsCache.at < STATS_TTL_MS) {
    return _statsCache.data;
  }
  const types = discoverTypes();
  let totalHits = 0;
  let totalUrls = 0;
  let totalQueries = 0;
  const byType: Record<string, number> = {};
  let dbSizeBytes = 0;

  for (const type of types) {
    try {
      const db = getDbForType(type);
      const hits = (db.prepare("SELECT COUNT(*) AS c FROM query_hits").get() as { c: number }).c;
      const urls = (db.prepare("SELECT COUNT(*) AS c FROM urls").get() as { c: number }).c;
      const queries = (
        db.prepare("SELECT COUNT(DISTINCT query_norm) AS c FROM query_hits").get() as { c: number }
      ).c;
      totalHits += hits;
      totalUrls += urls;
      totalQueries += queries;
      byType[type] = hits;
      try {
        dbSizeBytes += statSync(indexerDbForType(type)).size;
      } catch {
        // file not yet flushed to disk
      }
    } catch (err) {
      logger.warn("indexer", `getStats failed for type=${type}`, err);
    }
  }

  const data = { totalHits, totalUrls, totalQueries, byType, dbSizeBytes };
  _statsCache = { data, at: Date.now() };
  return data;
};

const shardHits = (
  type: string,
  q: string | undefined,
  limit: number,
): HitRow[] => {
  try {
    const db = getDbForType(type);
    const term = q?.trim();
    const params: Record<string, string | number> = { $limit: limit, $offset: 0 };
    if (term) {
      let stmt = _listSearchQs.get(type);
      if (!stmt) {
        stmt = db.prepare(
          `${LIST_SELECT} ${SEARCH_WHERE} ORDER BY h.last_seen DESC LIMIT $limit OFFSET $offset`,
        );
        _listSearchQs.set(type, stmt);
      }
      params.$term = `%${escapeLike(term.toLowerCase())}%`;
      return stmt.all(params) as HitRow[];
    }
    let stmt = _listAllQs.get(type);
    if (!stmt) {
      stmt = db.prepare(
        `${LIST_SELECT} ORDER BY h.last_seen DESC LIMIT $limit OFFSET $offset`,
      );
      _listAllQs.set(type, stmt);
    }
    return stmt.all(params) as HitRow[];
  } catch (err) {
    logger.warn("indexer", `shardHits failed for type=${type}`, err);
    return [];
  }
};

const shardCount = (type: string, q: string | undefined): number => {
  try {
    const db = getDbForType(type);
    const term = q?.trim();
    if (term) {
      let stmt = _countSearchQs.get(type);
      if (!stmt) {
        stmt = db.prepare(
          `SELECT COUNT(*) AS c FROM query_hits h JOIN urls u ON u.id = h.url_id ${SEARCH_WHERE}`,
        );
        _countSearchQs.set(type, stmt);
      }
      return (stmt.get({ $term: `%${escapeLike(term.toLowerCase())}%` }) as { c: number }).c;
    }
    let stmt = _countAllQs.get(type);
    if (!stmt) {
      stmt = db.prepare(
        "SELECT COUNT(*) AS c FROM query_hits h JOIN urls u ON u.id = h.url_id",
      );
      _countAllQs.set(type, stmt);
    }
    return (stmt.get() as { c: number }).c;
  } catch (err) {
    logger.warn("indexer", `shardCount failed for type=${type}`, err);
    return 0;
  }
};

export const listHits = (opts: {
  q?: string;
  type?: string;
  limit: number;
  offset: number;
}): HitRow[] => {
  const types = opts.type ? [opts.type] : discoverTypes();
  if (opts.type) {
    return shardHits(opts.type, opts.q, opts.limit + opts.offset)
      .slice(opts.offset, opts.offset + opts.limit);
  }
  const fetchLimit = opts.offset + opts.limit;
  const merged: HitRow[] = [];
  for (const type of types) merged.push(...shardHits(type, opts.q, fetchLimit));
  merged.sort((a, b) => b.last_seen - a.last_seen);
  return merged.slice(opts.offset, opts.offset + opts.limit);
};

export const countHits = (q?: string, type?: string): number => {
  const types = type ? [type] : discoverTypes();
  let total = 0;
  for (const t of types) total += shardCount(t, q);
  return total;
};

export const deleteHits = async (items: DeleteItem[]): Promise<number> => {
  const clean = items.filter(
    (it) => Number.isInteger(it.id) && it.id > 0 && typeof it.engine_type === "string",
  );
  if (clean.length === 0) return 0;

  const byType = new Map<string, number[]>();
  for (const { id, engine_type } of clean) {
    let ids = byType.get(engine_type);
    if (!ids) {
      ids = [];
      byType.set(engine_type, ids);
    }
    ids.push(id);
  }

  let deleted = 0;
  await Promise.all(
    Array.from(byType.entries()).map(([type, ids]) =>
      mutexFor(type)(async () => {
        try {
          const db = getDbForType(type);
          const placeholders = ids.map(() => "?").join(",");
          const tx = db.transaction(() => {
            db.prepare(`DELETE FROM query_hits WHERE id IN (${placeholders})`).run(...ids);
            pruneOrphanUrls(db);
          });
          tx();
          deleted += ids.length;
          invalidateTypes();
          wipeStatsCache();
        } catch (err) {
          logger.error("indexer", `deleteHits failed for type=${type}`, err);
          throw err;
        }
      }),
    ),
  );

  return deleted;
};

export const clearAll = async (): Promise<void> => {
  const types = discoverTypes();
  await Promise.all(
    types.map((type) =>
      mutexFor(type)(async () => {
        try {
          const db = getDbForType(type);
          db.exec("DELETE FROM query_hits");
          db.exec("DELETE FROM urls");
          db.exec("INSERT INTO urls_fts(urls_fts) VALUES('rebuild')");
          db.exec("VACUUM");
        } catch (err) {
          logger.error("indexer", `clearAll failed for type=${type}`, err);
          throw err;
        }
      }),
    ),
  );
  invalidateTypes();
  wipeStatsCache();
};

export const sampleRows = (type: string, limit = 5): ExportRow[] => {
  try {
    const db = getDbForType(type);
    let stmt = _sampleQs.get(type);
    if (!stmt) {
      stmt = db.prepare(`${EXPORT_SQL} ORDER BY h.last_seen DESC LIMIT ?`);
      _sampleQs.set(type, stmt);
    }
    return stmt.all(limit) as ExportRow[];
  } catch (err) {
    logger.warn("indexer", `sampleRows failed for type=${type}`, err);
    return [];
  }
};

export { checkpointType };
