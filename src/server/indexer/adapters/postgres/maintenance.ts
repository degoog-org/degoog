import { createHash } from "crypto";
import type { PgSql } from "./statements";

export const ensureHitsIndex = async (sql: PgSql, schema: string): Promise<void> => {
  // PostgreSQL identifiers are limited to 63 bytes.
  const hash = createHash("sha1").update(schema).digest("hex").slice(0, 8);
  const prefix = "idx_";
  const suffix = "_hits_url_id";
  const maxSchemaLen = 63 - prefix.length - suffix.length - hash.length - 1;

  const indexName = `${prefix}${schema.slice(0, maxSchemaLen)}_${hash}${suffix}`;

  const [index] = await sql<{ indisvalid: boolean }[]>`
    SELECT i.indisvalid
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_index i ON i.indexrelid = c.oid
    WHERE c.relkind = 'i'
      AND c.relname = ${indexName}
      AND n.nspname = ${schema}
  `;

  if (index && !index.indisvalid) {
    await sql`
      DROP INDEX CONCURRENTLY IF EXISTS
      ${sql(schema)}.${sql(indexName)}
    `;
  }

  if (!index || !index.indisvalid) {
    await sql`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS
      ${sql(indexName)}
      ON ${sql(schema)}.query_hits (url_id)
    `;
  }
};

export const ensureHitsColumns = async (sql: PgSql, schema: string): Promise<void> => {
  const existing = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = ${schema}
      AND table_name = 'query_hits'
      AND column_name IN ('pos_sum', 'sources_json', 'filters_json', 'meta_json')
  `;
  const present = new Set(existing.map((c) => c.column_name));
  const hadPosSum = present.has("pos_sum");

  if (!hadPosSum)
    await sql`ALTER TABLE ${sql(schema)}.query_hits ADD COLUMN IF NOT EXISTS pos_sum BIGINT NOT NULL DEFAULT 9999`;
  if (!present.has("sources_json"))
    await sql`ALTER TABLE ${sql(schema)}.query_hits ADD COLUMN IF NOT EXISTS sources_json TEXT`;
  if (!present.has("filters_json"))
    await sql`ALTER TABLE ${sql(schema)}.query_hits ADD COLUMN IF NOT EXISTS filters_json TEXT`;
  if (!present.has("meta_json"))
    await sql`ALTER TABLE ${sql(schema)}.query_hits ADD COLUMN IF NOT EXISTS meta_json TEXT`;

  if (!hadPosSum)
    await sql`UPDATE ${sql(schema)}.query_hits SET pos_sum = best_position * hit_count`;
};
