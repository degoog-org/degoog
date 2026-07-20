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

export const isRecalled = (r: SearchResult): boolean => {
  const sources = (r as ScoredResult).sources ?? [];
  return r.source === DEGOOG_ENGINE_NAME || sources.includes(DEGOOG_ENGINE_NAME);
};

export const tagIndexRelation = (
  results: ScoredResult[],
  indexedUrls?: ReadonlySet<string>,
): ScoredResult[] =>
  results.map((r) => {
    if (isRecalled(r)) return { ...r, idx: "recalled" };
    if (indexedUrls?.has(r.url)) return { ...r, idx: "indexing" };
    return r;
  });

interface Indexable {
  items: SearchResult[];
  positions: number[];
}

const selectIndexable = async (results: SearchResult[]): Promise<Indexable> => {
  const cfg = await getIndexerConfig();
  const items: SearchResult[] = [];
  const positions: number[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (isRecalled(r) || !shouldIndex(r, cfg)) continue;
    items.push(r);
    positions.push(i);
    if (cfg.maxPerSearch > 0 && items.length >= cfg.maxPerSearch) break;
  }
  return { items, positions };
};

const enqueueIndexable = async (
  queryNorm: string,
  engineType: string,
  selected: Indexable,
  filtersJson: string | null,
): Promise<void> => {
  const { recorderFor } = await import("../recorders");
  const recorder = recorderFor(engineType);
  const rows = recorder.toRows(
    queryNorm,
    engineType,
    selected.items,
    filtersJson,
    selected.positions,
  );
  if (rows.length > 0) enqueue(rows);
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
  const selected = await selectIndexable(results);
  if (selected.items.length === 0) return;
  await enqueueIndexable(queryNorm, engineType, selected, filtersJson || null);
};

export const maybeIndex = async (
  enabled: boolean,
  query: string,
  engineType: string,
  results: ScoredResult[],
  filtersJson = "",
): Promise<string[]> => {
  if (!enabled || !query) return [];
  const queryNorm = normalizeQuery(query);
  if (!queryNorm) return [];
  const selected = await selectIndexable(results);
  if (selected.items.length === 0) return [];
  await enqueueIndexable(queryNorm, engineType, selected, filtersJson || null);
  return selected.items.map((r) => r.url);
};
