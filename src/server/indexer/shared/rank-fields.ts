import type { ExportRow } from "../types/adapter";

const SENTINEL_POSITION = 9999;

export interface RankFields {
  best_position: number;
  pos_sum: number;
  hit_count: number;
  sources_json: string | null;
  filters_json: string | null;
  meta_json: string | null;
}

const asCount = (value: number | null | undefined): number =>
  typeof value === "number" && value > 0 ? value : 1;

const asPosition = (value: number | null | undefined): number =>
  typeof value === "number" && value > 0 ? value : SENTINEL_POSITION;

export const rankFields = (row: ExportRow): RankFields => {
  const hitCount = asCount(row.hit_count);
  const bestPosition = asPosition(row.best_position);
  const posSum =
    typeof row.pos_sum === "number" && row.pos_sum > 0
      ? row.pos_sum
      : bestPosition * hitCount;

  return {
    best_position: bestPosition,
    pos_sum: posSum,
    hit_count: hitCount,
    sources_json: row.sources_json ?? null,
    filters_json: row.filters_json ?? null,
    meta_json: row.meta_json ?? null,
  };
};
