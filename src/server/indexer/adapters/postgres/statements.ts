import type postgres from "postgres";
import type { TransactionSql } from "postgres";
import type { IndexerHitRow } from "../../../../shared/indexer";
import type { ExportRow, UrlRow } from "../../types/adapter";
import type { IndexRow } from "../../recorders/default";
import { FUZZY_CANDIDATE_CAP } from "../../shared/terms";

export type PgSql = ReturnType<typeof postgres>;

export const writePgRows = async (
  tx: TransactionSql,
  schema: string,
  rows: IndexRow[],
  now: number,
  window: number,
): Promise<void> => {
  for (const row of rows) {
    const [urlRow] = await tx<{ id: number }[]>`
      INSERT INTO ${tx(schema)}.urls (
        url_norm, url, source_engine, title, snippet,
        thumbnail, image_url, is_gif, duration, extras_json,
        first_seen, last_seen
      ) VALUES (
        ${row.url_norm}, ${row.url}, ${row.source_engine}, ${row.title}, ${row.snippet},
        ${row.thumbnail}, ${row.image_url}, ${row.is_gif}, ${row.duration}, ${row.extras_json},
        ${now}, ${now}
      )
      ON CONFLICT (url_norm) DO UPDATE SET
        last_seen = EXCLUDED.last_seen,
        title = CASE WHEN length(urls.title) >= length(EXCLUDED.title) THEN urls.title ELSE EXCLUDED.title END,
        snippet = CASE WHEN length(urls.snippet) >= length(EXCLUDED.snippet) THEN urls.snippet ELSE EXCLUDED.snippet END,
        thumbnail = COALESCE(urls.thumbnail, EXCLUDED.thumbnail),
        image_url = COALESCE(urls.image_url, EXCLUDED.image_url),
        is_gif = COALESCE(urls.is_gif, EXCLUDED.is_gif),
        duration = COALESCE(urls.duration, EXCLUDED.duration),
        extras_json = COALESCE(urls.extras_json, EXCLUDED.extras_json)
      RETURNING id
    `;
    await tx`
      INSERT INTO ${tx(schema)}.query_hits
        (query_norm, engine_type, url_id, best_position, pos_sum, hit_count,
         sources_json, filters_json, meta_json, first_seen, last_seen)
      VALUES
        (${row.query_norm}, ${row.engine_type}, ${urlRow.id}, ${row.position}, ${row.position}, 1,
         ${row.sources_json}, ${row.filters_json}, ${row.meta_json}, ${now}, ${now})
      ON CONFLICT (query_norm, engine_type, url_id) DO UPDATE SET
        last_seen = EXCLUDED.last_seen,
        best_position = LEAST(query_hits.best_position, EXCLUDED.best_position),
        pos_sum = CASE
          WHEN query_hits.hit_count >= ${window}
          THEN (query_hits.pos_sum * (${window} - 1) / query_hits.hit_count) + EXCLUDED.pos_sum
          ELSE query_hits.pos_sum + EXCLUDED.pos_sum
        END,
        hit_count = CASE
          WHEN query_hits.hit_count >= ${window}
          THEN ${window}
          ELSE query_hits.hit_count + 1
        END,
        sources_json = (
          SELECT COALESCE(jsonb_agg(DISTINCT v)::text, '[]')
          FROM (
            SELECT jsonb_array_elements_text(COALESCE(query_hits.sources_json::jsonb, '[]'::jsonb)) AS v
            UNION
            SELECT jsonb_array_elements_text(COALESCE(EXCLUDED.sources_json::jsonb, '[]'::jsonb))
          ) s
        ),
        filters_json = COALESCE(NULLIF(EXCLUDED.filters_json, ''), query_hits.filters_json),
        meta_json = COALESCE(query_hits.meta_json, EXCLUDED.meta_json)
    `;
  }
};

export const selectExact = (
  sql: PgSql,
  schema: string,
  type: string,
  queryNorm: string,
  limit: number,
  offset: number,
) =>
  sql<UrlRow[]>`
    SELECT u.url, u.source_engine, u.title, u.snippet, u.thumbnail,
           u.image_url, u.is_gif, u.duration, u.extras_json
    FROM ${sql(schema)}.query_hits h
    JOIN ${sql(schema)}.urls u ON u.id = h.url_id
    WHERE h.query_norm = ${queryNorm} AND h.engine_type = ${type}
    ORDER BY (h.pos_sum::float / h.hit_count) ASC, h.hit_count DESC, h.best_position ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

export const selectFuzzy = (
  sql: PgSql,
  schema: string,
  type: string,
  queryNorm: string,
  pgExpr: string,
  limit: number,
  offset: number,
) =>
  sql<UrlRow[]>`
    WITH recent AS (
      SELECT u.url, u.source_engine, u.title, u.snippet, u.thumbnail,
             u.image_url, u.is_gif, u.duration, u.extras_json,
             u.search_vec, u.last_seen
      FROM ${sql(schema)}.urls u
      WHERE u.search_vec @@ to_tsquery('simple', ${pgExpr})
        AND EXISTS (
          SELECT 1 FROM ${sql(schema)}.query_hits h
          WHERE h.url_id = u.id
            AND h.engine_type = ${type}
            AND h.query_norm != ${queryNorm}
        )
      ORDER BY u.last_seen DESC
      LIMIT ${FUZZY_CANDIDATE_CAP}
    )
    SELECT url, source_engine, title, snippet, thumbnail,
           image_url, is_gif, duration, extras_json
    FROM recent
    ORDER BY ts_rank(search_vec, to_tsquery('simple', ${pgExpr})) DESC,
             last_seen DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

export const countType = async (sql: PgSql, schema: string) => {
  const [hits] = await sql<{ c: number }[]>`
    SELECT COUNT(*) AS c FROM ${sql(schema)}.query_hits
  `;
  const [urls] = await sql<{ c: number }[]>`
    SELECT COUNT(*) AS c FROM ${sql(schema)}.urls
  `;
  const [queries] = await sql<{ c: number }[]>`
    SELECT COUNT(DISTINCT query_norm) AS c FROM ${sql(schema)}.query_hits
  `;
  return {
    hits: Number(hits.c),
    urls: Number(urls.c),
    queries: Number(queries.c),
  };
};

export const sumSchemaSize = async (sql: PgSql, schemas: string[]): Promise<number> => {
  const [row] = await sql<{ total: string }[]>`
    SELECT COALESCE(SUM(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))), 0) AS total
    FROM pg_tables
    WHERE schemaname = ANY(${schemas})
  `;
  return Number(row.total);
};

export const listHits = (
  sql: PgSql,
  schema: string,
  q: string | undefined,
  limit: number,
  offset: number,
) => {
  if (q?.trim()) {
    const term = `%${q.trim().toLowerCase()}%`;
    return sql<IndexerHitRow[]>`
      SELECT h.id, h.query_norm, h.engine_type, u.url, u.title, u.snippet, h.last_seen,
             (h.pos_sum::float / h.hit_count) AS score
      FROM ${sql(schema)}.query_hits h
      JOIN ${sql(schema)}.urls u ON u.id = h.url_id
      WHERE lower(h.query_norm) LIKE ${term}
         OR lower(u.url) LIKE ${term}
         OR lower(u.title) LIKE ${term}
      ORDER BY h.query_norm ASC, score ASC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }
  return sql<IndexerHitRow[]>`
    SELECT h.id, h.query_norm, h.engine_type, u.url, u.title, u.snippet, h.last_seen,
           (h.pos_sum::float / h.hit_count) AS score
    FROM ${sql(schema)}.query_hits h
    JOIN ${sql(schema)}.urls u ON u.id = h.url_id
    ORDER BY h.query_norm ASC, score ASC
    LIMIT ${limit} OFFSET ${offset}
  `;
};

export const countHits = async (sql: PgSql, schema: string, q: string | undefined): Promise<number> => {
  if (q?.trim()) {
    const term = `%${q.trim().toLowerCase()}%`;
    const [row] = await sql<{ c: number }[]>`
      SELECT COUNT(*) AS c
      FROM ${sql(schema)}.query_hits h
      JOIN ${sql(schema)}.urls u ON u.id = h.url_id
      WHERE lower(h.query_norm) LIKE ${term}
         OR lower(u.url) LIKE ${term}
         OR lower(u.title) LIKE ${term}
    `;
    return Number(row.c);
  }
  const [row] = await sql<{ c: number }[]>`
    SELECT COUNT(*) AS c
    FROM ${sql(schema)}.query_hits h
    JOIN ${sql(schema)}.urls u ON u.id = h.url_id
  `;
  return Number(row.c);
};

export const selectSample = (sql: PgSql, schema: string, limit: number) =>
  sql<ExportRow[]>`
    SELECT h.query_norm, h.engine_type, u.url, u.url_norm, u.source_engine,
           u.title, u.snippet, u.thumbnail, u.image_url, u.is_gif, u.duration,
           u.extras_json, h.first_seen, h.last_seen, NULL AS source_instance
    FROM ${sql(schema)}.query_hits h
    JOIN ${sql(schema)}.urls u ON u.id = h.url_id
    ORDER BY h.last_seen DESC
    LIMIT ${limit}
  `;

export const exportCursor = (sql: PgSql, schema: string, size: number) =>
  sql<ExportRow[]>`
    SELECT h.query_norm, h.engine_type, u.url, u.url_norm, u.source_engine,
           u.title, u.snippet, u.thumbnail, u.image_url, u.is_gif, u.duration,
           u.extras_json, h.first_seen, h.last_seen, NULL AS source_instance,
           h.best_position, h.pos_sum, h.hit_count,
           h.sources_json, h.filters_json, h.meta_json
    FROM ${sql(schema)}.query_hits h
    JOIN ${sql(schema)}.urls u ON u.id = h.url_id
  `.cursor(size);
