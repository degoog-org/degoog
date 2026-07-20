import type { DeleteItem } from "../../../shared/indexer";
import type { HitRow } from "../types/adapter";
import { getAdapter } from "../db/factory";
import { discoverTypes } from "../db/lifecycle";
import { wipeStatsCache } from "./stats";
import { logger } from "../../utils/logger";

export const listHits = async (opts: {
  q?: string;
  type?: string;
  limit: number;
  offset: number;
}): Promise<HitRow[]> => {
  const adapter = getAdapter();
  const types = opts.type ? [opts.type] : discoverTypes();

  if (opts.type) {
    return adapter.listHitsForType(opts.type, opts.q, opts.limit, opts.offset);
  }

  const fetchLimit = opts.offset + opts.limit;
  const all = await Promise.all(
    types.map((t) => adapter.listHitsForType(t, opts.q, fetchLimit, 0)),
  );
  const merged = all
    .flat()
    .sort((a, b) => a.query_norm.localeCompare(b.query_norm) || a.score - b.score);
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
