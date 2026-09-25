import type { PgSql } from "./statements";
import type { ExportRow } from "../../types/adapter";
import { rankFields } from "../../shared/rank-fields";

const IMPORT_BATCH_SIZE = 500;

export const importPgRows = async (
  sql: PgSql,
  schema: string,
  type: string,
  rows: ExportRow[],
): Promise<{ urls: number; hits: number }> => {
  let urlsInserted = 0;
  let hitsInserted = 0;

  for (let i = 0; i < rows.length; i += IMPORT_BATCH_SIZE) {
    const batch = rows.slice(i, i + IMPORT_BATCH_SIZE);
    await sql.begin(async (tx) => {
      for (const row of batch) {
        const urlRows = await tx<{ id: number }[]>`
          INSERT INTO ${tx(schema)}.urls (
            url_norm, url, source_engine, title, snippet,
            thumbnail, image_url, is_gif, duration, extras_json,
            first_seen, last_seen
          ) VALUES (
            ${row.url_norm}, ${row.url}, ${row.source_engine}, ${row.title}, ${row.snippet},
            ${row.thumbnail}, ${row.image_url}, ${row.is_gif}, ${row.duration}, ${row.extras_json},
            ${row.first_seen}, ${row.last_seen}
          )
          ON CONFLICT (url_norm) DO NOTHING
          RETURNING id
        `;
        if (urlRows.length > 0) urlsInserted++;

        const [existingUrl] =
          urlRows.length > 0
            ? urlRows
            : await tx<
                { id: number }[]
              >`SELECT id FROM ${tx(schema)}.urls WHERE url_norm = ${row.url_norm}`;

        if (!existingUrl) continue;

        const rank = rankFields(row);
        const hitRows = await tx<{ id: number }[]>`
          INSERT INTO ${tx(schema)}.query_hits
            (query_norm, engine_type, url_id, best_position, pos_sum, hit_count,
             sources_json, filters_json, meta_json, first_seen, last_seen)
          VALUES
            (${row.query_norm}, ${type}, ${existingUrl.id}, ${rank.best_position}, ${rank.pos_sum}, ${rank.hit_count},
             ${rank.sources_json}, ${rank.filters_json}, ${rank.meta_json}, ${row.first_seen}, ${row.last_seen})
          ON CONFLICT (query_norm, engine_type, url_id) DO NOTHING
          RETURNING id
        `;
        if (hitRows.length > 0) hitsInserted++;
      }
    });
  }

  return { urls: urlsInserted, hits: hitsInserted };
};
