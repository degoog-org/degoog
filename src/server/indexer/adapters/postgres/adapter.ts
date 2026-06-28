import postgres from "postgres";
import type {
  IndexerAdapter,
  UrlRow,
  HitRow,
  TypeCounts,
  ExportRow,
} from "../../types/adapter";
import type { IndexRow } from "../../recorders";
import type { IndexerConfig } from "../../types/config";
import { safeSlug } from "../../shared/safe-type";
import { logger } from "../../../utils/logger";
import { initPgSchema } from "./schema";
import { runPgPrune } from "./prune";
import { createHash } from "crypto";

const IMPORT_BATCH_SIZE = 500;

export class PgAdapter implements IndexerAdapter {
  private readonly _sql: ReturnType<typeof postgres>;
  private readonly _types = new Set<string>();

  constructor(url: string) {
    this._sql = postgres(url, {
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10,
    });
  }

  async boot(): Promise<void> {
    try {
      const rows = await this._sql<{ table_schema: string }[]>`
        SELECT DISTINCT table_schema
        FROM information_schema.tables
        WHERE table_name = 'urls'
          AND table_schema NOT IN ('public', 'information_schema', 'pg_catalog')
      `;
      for (const row of rows) this._types.add(row.table_schema);
      logger.info(
        "indexer",
        `postgres adapter booted, found types: [${Array.from(this._types).join(", ")}]`,
      );
    } catch (err) {
      logger.error("indexer", "postgres adapter boot failed", err);
      throw err;
    }
  }

  async open(type: string): Promise<void> {
    const schema = safeSlug(type);
    if (this._types.has(schema)) return;

    await this._sql.begin(async (tx) => initPgSchema(tx, schema));

    // PostgreSQL identifiers are limited to 63 bytes.
    const hash = createHash("sha1").update(schema).digest("hex").slice(0, 8);
    const prefix = "idx_";
    const suffix = "_hits_url_id";
    const maxSchemaLen = 63 - prefix.length - suffix.length - hash.length - 1;

    const indexName = `${prefix}${schema.slice(0, maxSchemaLen)}_${hash}${suffix}`;

    const [index] = await this._sql<{ indisvalid: boolean }[]>`
      SELECT i.indisvalid
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_index i ON i.indexrelid = c.oid
      WHERE c.relkind = 'i'
        AND c.relname = ${indexName}
        AND n.nspname = ${schema}
    `;

    if (index && !index.indisvalid) {
      await this._sql`
        DROP INDEX CONCURRENTLY IF EXISTS
        ${this._sql(schema)}.${this._sql(indexName)}
      `;
    }

    if (!index || !index.indisvalid) {
      await this._sql`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS
        ${this._sql(indexName)}
        ON ${this._sql(schema)}.query_hits (url_id)
      `;
    }

    this._types.add(schema);
  }

  discoverTypes(): string[] {
    return Array.from(this._types);
  }

  async close(): Promise<void> {
    try {
      await this._sql.end();
    } catch (err) {
      logger.warn("indexer", "postgres close failed", err);
    }
  }

  async checkpoint(_type: string): Promise<void> {}

  async writeBatch(type: string, rows: IndexRow[], now: number): Promise<void> {
    const schema = safeSlug(type);
    await this.open(type);
    await this._sql.begin(async (tx) => {
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
            (query_norm, engine_type, url_id, best_position, hit_count, first_seen, last_seen)
          VALUES
            (${row.query_norm}, ${row.engine_type}, ${urlRow.id}, ${row.position}, 1, ${now}, ${now})
          ON CONFLICT (query_norm, engine_type, url_id) DO UPDATE SET
            last_seen = EXCLUDED.last_seen,
            best_position = LEAST(query_hits.best_position, EXCLUDED.best_position),
            hit_count = query_hits.hit_count + 1
        `;
      }
    });
  }

  async importRows(
    type: string,
    rows: ExportRow[],
  ): Promise<{ urls: number; hits: number }> {
    const schema = safeSlug(type);
    await this.open(type);
    let urlsInserted = 0;
    let hitsInserted = 0;

    for (let i = 0; i < rows.length; i += IMPORT_BATCH_SIZE) {
      const batch = rows.slice(i, i + IMPORT_BATCH_SIZE);
      await this._sql.begin(async (tx) => {
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

          const hitRows = await tx<{ id: number }[]>`
            INSERT INTO ${tx(schema)}.query_hits
              (query_norm, engine_type, url_id, best_position, hit_count, first_seen, last_seen)
            VALUES
              (${row.query_norm}, ${type}, ${existingUrl.id}, 9999, 1, ${row.first_seen}, ${row.last_seen})
            ON CONFLICT (query_norm, engine_type, url_id) DO NOTHING
            RETURNING id
          `;
          if (hitRows.length > 0) hitsInserted++;
        }
      });
    }

    return { urls: urlsInserted, hits: hitsInserted };
  }

  async queryExact(
    type: string,
    queryNorm: string,
    limit: number,
    offset = 0,
  ): Promise<UrlRow[]> {
    const schema = safeSlug(type);
    try {
      return await this._sql<UrlRow[]>`
        SELECT u.url, u.source_engine, u.title, u.snippet, u.thumbnail,
               u.image_url, u.is_gif, u.duration, u.extras_json
        FROM ${this._sql(schema)}.query_hits h
        JOIN ${this._sql(schema)}.urls u ON u.id = h.url_id
        WHERE h.query_norm = ${queryNorm} AND h.engine_type = ${type}
        ORDER BY h.best_position ASC, h.hit_count DESC, h.last_seen DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } catch (err) {
      logger.warn("indexer", `queryExact failed for type=${type}`, err);
      return [];
    }
  }

  async queryFuzzy(
    type: string,
    queryNorm: string,
    limit: number,
    offset = 0,
  ): Promise<UrlRow[]> {
    const schema = safeSlug(type);
    const pgExpr = queryNorm
      .split(/\s+/)
      .filter((t) => t.length >= 2)
      .map((t) => t.replace(/[^a-z0-9]/g, ""))
      .filter(Boolean)
      .map((t) => `${t}:*`)
      .join(" & ");
    if (!pgExpr) return [];
    try {
      return await this._sql<UrlRow[]>`
        SELECT u.url, u.source_engine, u.title, u.snippet, u.thumbnail,
               u.image_url, u.is_gif, u.duration, u.extras_json
        FROM ${this._sql(schema)}.urls u
        JOIN ${this._sql(schema)}.query_hits h ON h.url_id = u.id
        WHERE u.search_vec @@ to_tsquery('simple', ${pgExpr})
          AND h.engine_type = ${type}
          AND h.query_norm != ${queryNorm}
        ORDER BY ts_rank(u.search_vec, to_tsquery('simple', ${pgExpr})) DESC,
                 h.last_seen DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } catch (err) {
      logger.warn("indexer", `queryFuzzy failed for type=${type}`, err);
      return [];
    }
  }

  async getTypeCounts(type: string): Promise<TypeCounts> {
    const schema = safeSlug(type);
    try {
      const [hits] = await this._sql<{ c: number }[]>`
        SELECT COUNT(*) AS c FROM ${this._sql(schema)}.query_hits
      `;
      const [urls] = await this._sql<{ c: number }[]>`
        SELECT COUNT(*) AS c FROM ${this._sql(schema)}.urls
      `;
      const [queries] = await this._sql<{ c: number }[]>`
        SELECT COUNT(DISTINCT query_norm) AS c FROM ${this._sql(schema)}.query_hits
      `;
      return {
        hits: Number(hits.c),
        urls: Number(urls.c),
        queries: Number(queries.c),
      };
    } catch (err) {
      logger.warn("indexer", `getTypeCounts failed for type=${type}`, err);
      return { hits: 0, urls: 0, queries: 0 };
    }
  }

  async totalDbSize(types: string[]): Promise<number> {
    if (types.length === 0) return 0;
    try {
      const schemas = types.map(safeSlug);
      const [row] = await this._sql<{ total: string }[]>`
        SELECT COALESCE(SUM(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))), 0) AS total
        FROM pg_tables
        WHERE schemaname = ANY(${schemas})
      `;
      return Number(row.total);
    } catch (err) {
      logger.warn("indexer", "totalDbSize failed", err);
      return 0;
    }
  }

  async listHitsForType(
    type: string,
    q: string | undefined,
    limit: number,
    offset: number,
  ): Promise<HitRow[]> {
    const schema = safeSlug(type);
    try {
      if (q?.trim()) {
        const term = `%${q.trim().toLowerCase()}%`;
        return await this._sql<HitRow[]>`
          SELECT h.id, h.query_norm, h.engine_type, u.url, u.title, u.snippet, h.last_seen
          FROM ${this._sql(schema)}.query_hits h
          JOIN ${this._sql(schema)}.urls u ON u.id = h.url_id
          WHERE lower(h.query_norm) LIKE ${term}
             OR lower(u.url) LIKE ${term}
             OR lower(u.title) LIKE ${term}
          ORDER BY h.last_seen DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      }
      return await this._sql<HitRow[]>`
        SELECT h.id, h.query_norm, h.engine_type, u.url, u.title, u.snippet, h.last_seen
        FROM ${this._sql(schema)}.query_hits h
        JOIN ${this._sql(schema)}.urls u ON u.id = h.url_id
        ORDER BY h.last_seen DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } catch (err) {
      logger.warn("indexer", `listHitsForType failed for type=${type}`, err);
      return [];
    }
  }

  async countHitsForType(type: string, q: string | undefined): Promise<number> {
    const schema = safeSlug(type);
    try {
      if (q?.trim()) {
        const term = `%${q.trim().toLowerCase()}%`;
        const [row] = await this._sql<{ c: number }[]>`
          SELECT COUNT(*) AS c
          FROM ${this._sql(schema)}.query_hits h
          JOIN ${this._sql(schema)}.urls u ON u.id = h.url_id
          WHERE lower(h.query_norm) LIKE ${term}
             OR lower(u.url) LIKE ${term}
             OR lower(u.title) LIKE ${term}
        `;
        return Number(row.c);
      }
      const [row] = await this._sql<{ c: number }[]>`
        SELECT COUNT(*) AS c
        FROM ${this._sql(schema)}.query_hits h
        JOIN ${this._sql(schema)}.urls u ON u.id = h.url_id
      `;
      return Number(row.c);
    } catch (err) {
      logger.warn("indexer", `countHitsForType failed for type=${type}`, err);
      return 0;
    }
  }

  async sampleRows(type: string, limit: number): Promise<ExportRow[]> {
    const schema = safeSlug(type);
    try {
      return await this._sql<ExportRow[]>`
        SELECT h.query_norm, h.engine_type, u.url, u.url_norm, u.source_engine,
               u.title, u.snippet, u.thumbnail, u.image_url, u.is_gif, u.duration,
               u.extras_json, h.first_seen, h.last_seen, NULL AS source_instance
        FROM ${this._sql(schema)}.query_hits h
        JOIN ${this._sql(schema)}.urls u ON u.id = h.url_id
        ORDER BY h.last_seen DESC
        LIMIT ${limit}
      `;
    } catch (err) {
      logger.warn("indexer", `sampleRows failed for type=${type}`, err);
      return [];
    }
  }

  async exportRows(type: string): Promise<ExportRow[]> {
    const schema = safeSlug(type);
    try {
      return await this._sql<ExportRow[]>`
        SELECT h.query_norm, h.engine_type, u.url, u.url_norm, u.source_engine,
               u.title, u.snippet, u.thumbnail, u.image_url, u.is_gif, u.duration,
               u.extras_json, h.first_seen, h.last_seen, NULL AS source_instance
        FROM ${this._sql(schema)}.query_hits h
        JOIN ${this._sql(schema)}.urls u ON u.id = h.url_id
      `;
    } catch (err) {
      logger.warn("indexer", `exportRows failed for type=${type}`, err);
      return [];
    }
  }

  async deleteHitsForType(type: string, ids: number[]): Promise<void> {
    if (ids.length === 0) return;

    const schema = safeSlug(type);

    await this._sql.begin(async (tx) => {
      const deleted = await tx<{ url_id: number }[]>`
        DELETE FROM ${tx(schema)}.query_hits
        WHERE id = ANY(${ids})
        RETURNING url_id
      `;

      const urlIds = [...new Set(deleted.map((r) => r.url_id))];

      if (urlIds.length === 0) return;

      await tx`
        DELETE FROM ${tx(schema)}.urls u
        WHERE u.id = ANY(${urlIds})
          AND NOT EXISTS (
            SELECT 1
            FROM ${tx(schema)}.query_hits h
            WHERE h.url_id = u.id
          )
      `;
    });
  }

  async clearType(type: string): Promise<void> {
    const schema = safeSlug(type);
    await this._sql`DROP SCHEMA IF EXISTS ${this._sql(schema)} CASCADE`;
    this._types.delete(schema);
  }

  async pruneType(type: string, cfg: IndexerConfig): Promise<void> {
    const schema = safeSlug(type);
    try {
      await runPgPrune(this._sql, schema, cfg);
    } catch (err) {
      logger.warn("indexer", `pruneType failed for type=${type}`, err);
    }
  }
}
