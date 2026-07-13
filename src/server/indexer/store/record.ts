import type { ImageFilter, SearchParams, SearchResult, ScoredResult } from "../../types";
import { getIndexerConfig } from "../config/load";
import { shouldIndex } from "../filters/filters";
import { enqueue } from "../queue/queue";
import { DEGOOG_ENGINE_NAME, normalizeQuery } from "./mapper";

export type FilterContext = Pick<
  SearchParams,
  "lang" | "timeFilter" | "dateFrom" | "dateTo" | "imageFilter"
>;

const cleanImageFilter = (f?: ImageFilter): Record<string, string> | null => {
  if (!f) return null;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(f)) {
    if (typeof value === "string" && value && value !== "any") out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
};

export const toFilterTag = (params: FilterContext): string => {
  const tag: Record<string, unknown> = {};
  if (params.lang) tag.lang = params.lang;
  if (params.timeFilter && params.timeFilter !== "any") tag.time = params.timeFilter;
  if (params.dateFrom) tag.dateFrom = params.dateFrom;
  if (params.dateTo) tag.dateTo = params.dateTo;
  const img = cleanImageFilter(params.imageFilter);
  if (img) tag.img = img;
  return Object.keys(tag).length > 0 ? JSON.stringify(tag) : "";
};

export const recordResults = async (
  query: string,
  engineType: string,
  results: SearchResult[],
  filtersJson: string | null = null,
): Promise<void> => {
  if (!query || results.length === 0) return;
  const queryNorm = normalizeQuery(query);
  if (!queryNorm) return;
  const cfg = await getIndexerConfig();
  const { recorderFor } = await import("../recorders");
  const allowed = results.filter((r) => shouldIndex(r, cfg));
  const capped = cfg.maxPerSearch > 0 ? allowed.slice(0, cfg.maxPerSearch) : allowed;
  const recorder = recorderFor(engineType);
  const rows = recorder.toRows(queryNorm, engineType, capped, filtersJson || null);
  if (rows.length > 0) enqueue(rows);
};

export const maybeIndex = (
  enabled: boolean,
  query: string,
  engineType: string,
  results: ScoredResult[],
  filtersJson = "",
): boolean => {
  if (!enabled) return false;
  const toIndex = results.filter(
    (r) =>
      r.source !== DEGOOG_ENGINE_NAME &&
      !(r.sources ?? []).includes(DEGOOG_ENGINE_NAME),
  );
  if (toIndex.length === 0) return false;
  queueMicrotask(() => void recordResults(query, engineType, toIndex, filtersJson || null));
  return true;
};
