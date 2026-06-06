import type { SearchResult, ScoredResult } from "../types";
import { getAdapter } from "./db-factory";
import { getIndexerConfig } from "./config";
import { discoverTypes, checkpointType } from "./db";
import { shouldIndex } from "./filters";
import { enqueue } from "./queue";
import { logger } from "../utils/logger";

export { checkpointType };

export type { ExportRow, HitRow } from "./adapter";

const normalizeQuery = (query: string): string =>
  query.trim().toLowerCase().replace(/\s+/g, " ");


export const DEGOOG_ENGINE_NAME = "Degoog";

const PROTO_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const STATS_TTL_MS = 10_000;

export interface IndexerStats {
  totalHits: number;
  totalUrls: number;
  totalQueries: number;
  byType: Record<string, number>;
  dbSizeBytes: number;
  backend: "sqlite" | "postgres";
}

export interface DeleteItem {
  id: number;
  engine_type: string;
}

import type { UrlRow } from "./adapter";

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

let _statsCache: { data: IndexerStats; at: number } | null = null;

export const wipeStatsCache = (): void => {
  _statsCache = null;
};

export const recordResults = async (
  query: string,
  engineType: string,
  results: SearchResult[],
): Promise<void> => {
  if (!query || results.length === 0) return;
  const queryNorm = normalizeQuery(query);
  if (!queryNorm) return;
  const cfg = await getIndexerConfig();
  const { recorderFor } = await import("./recorders");
  const allowed = results.filter((r) => shouldIndex(r, cfg));
  const capped = cfg.maxPerSearch > 0 ? allowed.slice(0, cfg.maxPerSearch) : allowed;
  const recorder = recorderFor(engineType);
  const rows = recorder.toRows(queryNorm, engineType, capped);
  if (rows.length > 0) enqueue(rows);
};

export const maybeIndex = (
  enabled: boolean,
  query: string,
  engineType: string,
  results: ScoredResult[],
): boolean => {
  if (!enabled) return false;
  const toIndex = results.filter(
    (r) =>
      r.source !== DEGOOG_ENGINE_NAME &&
      !(r.sources ?? []).includes(DEGOOG_ENGINE_NAME),
  );
  if (toIndex.length === 0) return false;
  queueMicrotask(() => void recordResults(query, engineType, toIndex));
  return true;
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
  const adapter = getAdapter();
  try {
    const exact = await adapter.queryExact(engineType, queryNorm, cap);
    const seen = new Set(exact.map((r) => r.url));
    const remaining = cap - exact.length;
    let fuzzy: UrlRow[] = [];
    if (remaining > 0 && cfg.fuzzyEnabled) {
      fuzzy = (await adapter.queryFuzzy(engineType, queryNorm, remaining))
        .filter((r) => !seen.has(r.url));
    }
    return [...exact, ...fuzzy].map(rowToResult);
  } catch (err) {
    logger.warn("indexer", `queryIndex failed for type=${engineType}`, err);
    return [];
  }
};

export const getKnownTypes = (): string[] => discoverTypes();

export const getStats = async (): Promise<IndexerStats> => {
  if (_statsCache && Date.now() - _statsCache.at < STATS_TTL_MS) {
    return _statsCache.data;
  }
  const adapter = getAdapter();
  const types = discoverTypes();
  let totalHits = 0;
  let totalUrls = 0;
  let totalQueries = 0;
  const byType: Record<string, number> = {};

  await Promise.all(
    types.map(async (type) => {
      try {
        const counts = await adapter.getTypeCounts(type);
        totalHits += counts.hits;
        totalUrls += counts.urls;
        totalQueries += counts.queries;
        byType[type] = counts.hits;
      } catch (err) {
        logger.warn("indexer", `getStats failed for type=${type}`, err);
      }
    }),
  );

  const { isPostgresMode } = await import("./db-factory");
  const dbSizeBytes = await adapter.totalDbSize(types);

  const data: IndexerStats = {
    totalHits,
    totalUrls,
    totalQueries,
    byType,
    dbSizeBytes,
    backend: isPostgresMode() ? "postgres" : "sqlite",
  };
  _statsCache = { data, at: Date.now() };
  return data;
};

export const listHits = async (opts: {
  q?: string;
  type?: string;
  limit: number;
  offset: number;
}): Promise<import("./adapter").HitRow[]> => {
  const adapter = getAdapter();
  const types = opts.type ? [opts.type] : discoverTypes();

  if (opts.type) {
    return adapter.listHitsForType(opts.type, opts.q, opts.limit, opts.offset);
  }

  const fetchLimit = opts.offset + opts.limit;
  const all = await Promise.all(
    types.map((t) => adapter.listHitsForType(t, opts.q, fetchLimit, 0)),
  );
  const merged = all.flat().sort((a, b) => b.last_seen - a.last_seen);
  return merged.slice(opts.offset, opts.offset + opts.limit);
};

export const countHits = async (q?: string, type?: string): Promise<number> => {
  const adapter = getAdapter();
  const types = type ? [type] : discoverTypes();
  const counts = await Promise.all(types.map((t) => adapter.countHitsForType(t, q)));
  return counts.reduce((sum, c) => sum + c, 0);
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

  const adapter = getAdapter();
  let deleted = 0;
  await Promise.all(
    Array.from(byType.entries()).map(async ([type, ids]) => {
      try {
        await adapter.deleteHitsForType(type, ids);
        deleted += ids.length;
        wipeStatsCache();
      } catch (err) {
        logger.error("indexer", `deleteHits failed for type=${type}`, err);
        throw err;
      }
    }),
  );
  return deleted;
};

export const clearAll = async (): Promise<void> => {
  const adapter = getAdapter();
  const types = discoverTypes();
  await Promise.all(
    types.map(async (type) => {
      try {
        await adapter.clearType(type);
      } catch (err) {
        logger.error("indexer", `clearAll failed for type=${type}`, err);
        throw err;
      }
    }),
  );
  wipeStatsCache();
};

export const sampleRows = async (
  type: string,
  limit = 5,
): Promise<import("./adapter").ExportRow[]> => getAdapter().sampleRows(type, limit);
