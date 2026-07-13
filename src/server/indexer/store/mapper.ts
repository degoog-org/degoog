import type { SearchResult } from "../../types";
import type { UrlRow } from "../types/adapter";
import { logger } from "../../utils/logger";
import { DEGOOG_ENGINE_NAME } from "../../../shared/search-types";

export { DEGOOG_ENGINE_NAME };

const PROTO_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export const normalizeQuery = (query: string): string =>
  query.trim().toLowerCase().replace(/\s+/g, " ");

export const rowToResult = (row: UrlRow): SearchResult => {
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
