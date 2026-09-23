import type { Database } from "bun:sqlite";
import type { ExportRow } from "../../types/adapter";
import type { IndexRow } from "../../recorders/default";
import { rankFields } from "../../shared/rank-fields";
import { IMPORT_HIT, IMPORT_URL } from "./statements";

type UrlFields = Pick<
  IndexRow,
  | "url_norm"
  | "url"
  | "source_engine"
  | "title"
  | "snippet"
  | "thumbnail"
  | "image_url"
  | "is_gif"
  | "duration"
  | "extras_json"
>;

export const urlParams = (row: UrlFields, firstSeen: number, lastSeen: number) => ({
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
  $first_seen: firstSeen,
  $last_seen: lastSeen,
});

export const createRowImporter = (db: Database) => {
  const insertUrl = db.prepare(IMPORT_URL);
  const insertHit = db.prepare(IMPORT_HIT);
  const selectUrl = db.prepare("SELECT id FROM urls WHERE url_norm = ?");
  return db.transaction((rows: ExportRow[], engineType?: string) => {
    let urls = 0;
    let hits = 0;
    for (const row of rows) {
      const inserted = insertUrl.get(urlParams(row, row.first_seen, row.last_seen)) as
        | { id: number }
        | null;
      if (inserted) urls++;
      const urlId = inserted?.id ?? (selectUrl.get(row.url_norm) as { id: number } | null)?.id;
      if (!urlId) continue;
      const rank = rankFields(row);
      const result = insertHit.run({
        $query_norm: row.query_norm,
        $engine_type: engineType ?? row.engine_type,
        $url_id: urlId,
        $best_position: rank.best_position,
        $pos_sum: rank.pos_sum,
        $hit_count: rank.hit_count,
        $sources_json: rank.sources_json,
        $filters_json: rank.filters_json,
        $meta_json: rank.meta_json,
        $first_seen: row.first_seen,
        $last_seen: row.last_seen,
      });
      if (result.changes > 0) hits++;
    }
    return { urls, hits };
  });
};
