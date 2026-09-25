import postgres from "postgres";
import type { IndexerHitRow } from "../../../../shared/indexer";
import type {
  IndexerAdapter,
  UrlRow,
  TypeCounts,
  ExportRow,
} from "../../types/adapter";
import type { IndexRow } from "../../recorders/default";
import type { IndexerConfig } from "../../types/config";
import { safeSlug } from "../../shared/safe-type";
import { canPrefix, splitTerms } from "../../shared/terms";
import { logger } from "../../../utils/logger";
import { initPgSchema } from "./schema";
import { runPgPrune } from "./prune";
import type { PgConnectionConfig } from "../../db/pg-config";
import { ensureHitsColumns, ensureHitsIndex } from "./maintenance";
import { importPgRows } from "./import-rows";
import {
  countHits,
  countType,
  exportCursor,
  listHits,
  selectExact,
  selectFuzzy,
  selectSample,
  sumSchemaSize,
  writePgRows,
} from "./statements";

const POOL_OPTIONS = { max: 10, idle_timeout: 30, connect_timeout: 10 };

type PgConnectionInput = string | PgConnectionConfig;

export class PgAdapter implements IndexerAdapter {
  private readonly _sql: ReturnType<typeof postgres>;
  private readonly _types = new Set<string>();

  constructor(connection: PgConnectionInput) {
    this._sql =
      typeof connection === "string"
        ? postgres(connection, POOL_OPTIONS)
        : postgres({ ...connection, ...POOL_OPTIONS });
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
      for (const schema of this._types) {
        try {
          await ensureHitsIndex(this._sql, schema);
          await ensureHitsColumns(this._sql, schema);
        } catch (err) {
          logger.warn(
            "indexer",
            `hits maintenance failed for schema=${schema}`,
            err,
          );
        }
      }
    } catch (err) {
      logger.error("indexer", "postgres adapter boot failed", err);
      throw err;
    }
  }

  async open(type: string): Promise<void> {
    const schema = safeSlug(type);
    if (this._types.has(schema)) return;

    await this._sql.begin(async (tx) => initPgSchema(tx, schema));
    await ensureHitsIndex(this._sql, schema);
    await ensureHitsColumns(this._sql, schema);

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

  async writeBatch(type: string, rows: IndexRow[], now: number, window: number): Promise<void> {
    const schema = safeSlug(type);
    await this.open(type);
    await this._sql.begin(async (tx) => writePgRows(tx, schema, rows, now, window));
  }

  async importRows(
    type: string,
    rows: ExportRow[],
  ): Promise<{ urls: number; hits: number }> {
    const schema = safeSlug(type);
    await this.open(type);
    return importPgRows(this._sql, schema, type, rows);
  }

  async queryExact(
    type: string,
    queryNorm: string,
    limit: number,
    offset = 0,
  ): Promise<UrlRow[]> {
    const schema = safeSlug(type);
    try {
      return await selectExact(this._sql, schema, type, queryNorm, limit, offset);
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
    const pgExpr = splitTerms(queryNorm)
      .map((t) => (canPrefix(t) ? `${t.token}:*` : t.token))
      .join(" & ");
    if (!pgExpr) return [];
    try {
      return await selectFuzzy(this._sql, schema, type, queryNorm, pgExpr, limit, offset);
    } catch (err) {
      logger.warn("indexer", `queryFuzzy failed for type=${type}`, err);
      return [];
    }
  }

  async getTypeCounts(type: string): Promise<TypeCounts> {
    const schema = safeSlug(type);
    try {
      return await countType(this._sql, schema);
    } catch (err) {
      logger.warn("indexer", `getTypeCounts failed for type=${type}`, err);
      return { hits: 0, urls: 0, queries: 0 };
    }
  }

  async totalDbSize(types: string[]): Promise<number> {
    if (types.length === 0) return 0;
    try {
      const schemas = types.map(safeSlug);
      return await sumSchemaSize(this._sql, schemas);
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
  ): Promise<IndexerHitRow[]> {
    const schema = safeSlug(type);
    try {
      return await listHits(this._sql, schema, q, limit, offset);
    } catch (err) {
      logger.warn("indexer", `listHitsForType failed for type=${type}`, err);
      return [];
    }
  }

  async countHitsForType(type: string, q: string | undefined): Promise<number> {
    const schema = safeSlug(type);
    try {
      return await countHits(this._sql, schema, q);
    } catch (err) {
      logger.warn("indexer", `countHitsForType failed for type=${type}`, err);
      return 0;
    }
  }

  async sampleRows(type: string, limit: number): Promise<ExportRow[]> {
    const schema = safeSlug(type);
    try {
      return await selectSample(this._sql, schema, limit);
    } catch (err) {
      logger.warn("indexer", `sampleRows failed for type=${type}`, err);
      return [];
    }
  }

  holdExport(): string {
    return "";
  }

  touchHold(): void { }

  freeExport(): void { }

  async *exportBatches(type: string, size: number): AsyncIterable<ExportRow[]> {
    const schema = safeSlug(type);
    try {
      const cursor = exportCursor(this._sql, schema, size);
      for await (const rows of cursor) yield rows as ExportRow[];
    } catch (err) {
      logger.error("indexer", `exportBatches failed for type=${type}`, err);
      throw err;
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
