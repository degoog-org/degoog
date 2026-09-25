import type { SearchResult } from "../../../shared/search-types";
import type { UrlRow } from "../types/adapter";
import { getAdapter } from "../db/factory";
import { getIndexerConfig } from "../config/load";
import { normalizeQuery, rowToResult } from "./mapper";
import { logger } from "../../utils/logger";
import { splitTerms, termHit } from "../shared/terms";

export const queryIndex = async (
  query: string,
  engineType: string,
  limit?: number,
  page = 1,
): Promise<SearchResult[]> => {
  const queryNorm = normalizeQuery(query);
  if (!queryNorm) return [];
  const cfg = await getIndexerConfig();
  const cap = limit ?? cfg.queryLimit;
  const offset = (Math.max(1, page) - 1) * cap;
  const adapter = getAdapter();
  try {
    const exact = await adapter.queryExact(engineType, queryNorm, cap, offset);
    const seen = new Set(exact.map((r) => r.url));
    const remaining = cap - exact.length;
    let fuzzy: UrlRow[] = [];
    const terms = splitTerms(queryNorm);
    if (remaining > 0 && cfg.fuzzyEnabled && terms.length > 0) {
      const minHits = Math.max(1, Math.ceil(terms.length * cfg.fuzzyMinTermRatio));
      fuzzy = (await adapter.queryFuzzy(engineType, queryNorm, cap, offset))
        .filter((r) => {
          if (seen.has(r.url)) return false;
          seen.add(r.url);
          return true;
        })
        .filter((r) => {
          const text = `${r.title ?? ""} ${r.snippet ?? ""} ${r.url}`.toLowerCase();
          return terms.filter((t) => termHit(text, t)).length >= minHits;
        })
        .slice(0, remaining);
    }
    return [...exact, ...fuzzy].map(rowToResult);
  } catch (err) {
    logger.warn("indexer", `queryIndex failed for type=${engineType}`, err);
    return [];
  }
};
