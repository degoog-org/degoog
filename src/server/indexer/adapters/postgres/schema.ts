import type { TransactionSql } from "postgres";

export const initPgSchema = async (
  tx: TransactionSql,
  schema: string,
): Promise<void> => {
  await tx`CREATE SCHEMA IF NOT EXISTS ${tx(schema)}`;
  await tx`
    CREATE TABLE IF NOT EXISTS ${tx(schema)}.urls (
      id BIGSERIAL PRIMARY KEY,
      url_norm TEXT NOT NULL UNIQUE,
      url TEXT NOT NULL,
      source_engine TEXT NOT NULL,
      title TEXT NOT NULL,
      snippet TEXT NOT NULL,
      thumbnail TEXT,
      image_url TEXT,
      is_gif SMALLINT,
      duration TEXT,
      extras_json TEXT,
      first_seen BIGINT NOT NULL,
      last_seen BIGINT NOT NULL,
      search_vec tsvector GENERATED ALWAYS AS (
        to_tsvector('simple',
          coalesce(title, '') || ' ' ||
          coalesce(snippet, '') || ' ' ||
          coalesce(url, '')
        )
      ) STORED
    )
  `;
  await tx`
    CREATE TABLE IF NOT EXISTS ${tx(schema)}.query_hits (
      id BIGSERIAL PRIMARY KEY,
      query_norm TEXT NOT NULL,
      engine_type TEXT NOT NULL,
      url_id BIGINT NOT NULL REFERENCES ${tx(schema)}.urls(id) ON DELETE CASCADE,
      best_position INT NOT NULL DEFAULT 9999,
      pos_sum BIGINT NOT NULL DEFAULT 9999,
      hit_count INT NOT NULL DEFAULT 1,
      sources_json TEXT,
      filters_json TEXT,
      meta_json TEXT,
      first_seen BIGINT NOT NULL,
      last_seen BIGINT NOT NULL,
      UNIQUE(query_norm, engine_type, url_id)
    )
  `;
  await tx`CREATE INDEX IF NOT EXISTS ${tx(`idx_${schema}_hits_query_type`)}
           ON ${tx(schema)}.query_hits(query_norm, engine_type)`;
  await tx`CREATE INDEX IF NOT EXISTS ${tx(`idx_${schema}_hits_type`)}
           ON ${tx(schema)}.query_hits(engine_type)`;
  await tx`CREATE INDEX IF NOT EXISTS ${tx(`idx_${schema}_hits_last_seen`)}
           ON ${tx(schema)}.query_hits(last_seen)`;
  await tx`CREATE INDEX IF NOT EXISTS ${tx(`idx_${schema}_urls_last_seen`)}
           ON ${tx(schema)}.urls(last_seen)`;
  await tx`CREATE INDEX IF NOT EXISTS ${tx(`idx_${schema}_urls_fts`)}
           ON ${tx(schema)}.urls USING GIN(search_vec)`;
};
