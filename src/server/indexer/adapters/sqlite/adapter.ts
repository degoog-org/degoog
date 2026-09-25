import { Database, type Statement } from "bun:sqlite";
import type { IndexerHitRow } from "../../../../shared/indexer";
import { mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import type { IndexRow } from "../../recorders/default";
import type { IndexerConfig } from "../../types/config";
import type { IndexerAdapter, UrlRow, TypeCounts, ExportRow } from "../../types/adapter";
import { safeSlug } from "../../shared/safe-type";
import { indexerDir, indexerDbForType } from "../../../utils/paths";
import { logger } from "../../../utils/logger";
import { SQLITE_SCHEMA_DDL } from "./schema";
import {
  UPSERT_URL,
  UPSERT_HIT,
  EXACT_SQL,
  FUZZY_SQL,
  LIST_SEARCH_SQL,
  LIST_ALL_SQL,
  COUNT_SEARCH_SQL,
  COUNT_ALL_SQL,
} from "./statements";
import { EXPORT_SELECT_SQL } from "../../shared/export-select";
import { createRowImporter, urlParams } from "./import-rows";
import { buildFtsQuery, escapeLike } from "./fts";
import { FUZZY_CANDIDATE_CAP } from "../../shared/terms";
import { pruneOrphans, runSqlitePrune } from "./prune";
import { migrateHits } from "./migrate-hits";
import { ExportHolds, setAutoCheck } from "./export-holds";

export class SqliteAdapter implements IndexerAdapter {
  private readonly _dbs = new Map<string, Database>();
  private readonly _upsertUrlStmts = new Map<string, Statement>();
  private readonly _upsertHitStmts = new Map<string, Statement>();
  private readonly _exactQs = new Map<string, Statement>();
  private readonly _fuzzyQs = new Map<string, Statement>();
  private readonly _listAllQs = new Map<string, Statement>();
  private readonly _listSearchQs = new Map<string, Statement>();
  private readonly _countAllQs = new Map<string, Statement>();
  private readonly _countSearchQs = new Map<string, Statement>();
  private readonly _sampleQs = new Map<string, Statement>();
  private readonly _holds = new ExportHolds(this._dbs);

  async boot(): Promise<void> { }

  async open(type: string): Promise<void> {
    const key = safeSlug(type);
    if (this._dbs.has(key)) return;
    this._openDb(key);
  }

  private _openDb(key: string): Database {
    const existing = this._dbs.get(key);
    if (existing) return existing;
    mkdirSync(indexerDir(), { recursive: true });
    const db = new Database(indexerDbForType(key), { create: true });
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA synchronous = NORMAL");
    db.exec("PRAGMA foreign_keys = ON");
    if (this._holds.isHeld(key)) setAutoCheck(db, 0);
    try {
      db.transaction(() => {
        for (const sql of SQLITE_SCHEMA_DDL) db.exec(sql);
        migrateHits(db);
      })();
    } catch (err) {
      logger.error("indexer", `schema init failed for type=${key}`, err);
      throw err;
    }
    this._dbs.set(key, db);
    return db;
  }

  private _db(type: string): Database {
    return this._openDb(safeSlug(type));
  }

  discoverTypes(): string[] {
    try {
      return readdirSync(indexerDir())
        .filter((f) => f.startsWith("index-") && f.endsWith(".db"))
        .map((f) => f.slice(6, -3));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.debug("indexer", "indexer dir discovery failed", err);
      }
      return [];
    }
  }

  async close(): Promise<void> {
    for (const [type, db] of this._dbs) {
      try {
        db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
        db.close();
      } catch (err) {
        logger.warn("indexer", `close failed for type=${type}`, err);
      }
    }
    this._dbs.clear();
    for (const cache of [
      this._upsertUrlStmts, this._upsertHitStmts, this._exactQs,
      this._fuzzyQs, this._listAllQs, this._listSearchQs,
      this._countAllQs, this._countSearchQs, this._sampleQs,
    ]) cache.clear();
  }

  holdExport(type: string): string {
    return this._holds.hold(type);
  }

  touchHold(id: string): void {
    this._holds.touch(id);
  }

  freeExport(id: string): void {
    this._holds.release(id);
  }

  async checkpoint(type: string): Promise<void> {
    this._holds.checkpoint(type);
  }

  async writeBatch(type: string, rows: IndexRow[], now: number, window: number): Promise<void> {
    this._holds.dropStale();
    const db = this._db(type);
    let upsertUrl = this._upsertUrlStmts.get(type);
    if (!upsertUrl) {
      upsertUrl = db.prepare(UPSERT_URL);
      this._upsertUrlStmts.set(type, upsertUrl);
    }
    let upsertHit = this._upsertHitStmts.get(type);
    if (!upsertHit) {
      upsertHit = db.prepare(UPSERT_HIT);
      this._upsertHitStmts.set(type, upsertHit);
    }
    const tx = db.transaction((batch: IndexRow[]) => {
      for (const row of batch) {
        const urlIdRow = upsertUrl!.get(urlParams(row, now, now)) as { id: number };
        upsertHit!.run({
          $query_norm: row.query_norm,
          $engine_type: row.engine_type,
          $url_id: urlIdRow.id,
          $best_position: row.position,
          $sources_json: row.sources_json,
          $filters_json: row.filters_json,
          $meta_json: row.meta_json,
          $first_seen: now,
          $last_seen: now,
          $window: window,
        });
      }
    });
    tx(rows);
  }

  async importRows(type: string, rows: ExportRow[]): Promise<{ urls: number; hits: number }> {
    return createRowImporter(this._db(type))(rows, type);
  }

  async queryExact(type: string, queryNorm: string, limit: number, offset = 0): Promise<UrlRow[]> {
    try {
      const db = this._db(type);
      let stmt = this._exactQs.get(type);
      if (!stmt) {
        stmt = db.prepare(EXACT_SQL);
        this._exactQs.set(type, stmt);
      }
      return stmt.all(queryNorm, type, limit, offset) as UrlRow[];
    } catch (err) {
      logger.warn("indexer", `queryExact failed for type=${type}`, err);
      return [];
    }
  }

  async queryFuzzy(type: string, queryNorm: string, limit: number, offset = 0): Promise<UrlRow[]> {
    const ftsQuery = buildFtsQuery(queryNorm);
    if (!ftsQuery) return [];
    try {
      const db = this._db(type);
      let stmt = this._fuzzyQs.get(type);
      if (!stmt) {
        stmt = db.prepare(FUZZY_SQL);
        this._fuzzyQs.set(type, stmt);
      }
      return stmt.all(
        ftsQuery,
        type,
        queryNorm,
        FUZZY_CANDIDATE_CAP,
        limit,
        offset,
      ) as UrlRow[];
    } catch (err) {
      logger.warn("indexer", `queryFuzzy failed for type=${type}`, err);
      return [];
    }
  }

  async getTypeCounts(type: string): Promise<TypeCounts> {
    try {
      const db = this._db(type);
      const hits = (db.prepare("SELECT COUNT(*) AS c FROM query_hits").get() as { c: number }).c;
      const urls = (db.prepare("SELECT COUNT(*) AS c FROM urls").get() as { c: number }).c;
      const queries = (
        db.prepare("SELECT COUNT(DISTINCT query_norm) AS c FROM query_hits").get() as { c: number }
      ).c;
      return { hits, urls, queries };
    } catch (err) {
      logger.warn("indexer", `getTypeCounts failed for type=${type}`, err);
      return { hits: 0, urls: 0, queries: 0 };
    }
  }

  async totalDbSize(types: string[]): Promise<number> {
    let total = 0;
    for (const type of types) {
      try {
        total += statSync(indexerDbForType(safeSlug(type))).size;
      } catch {
        // file may not be flushed to disk yet. Not leaving a log or it'll spam.
      }
    }
    return total;
  }

  async listHitsForType(
    type: string,
    q: string | undefined,
    limit: number,
    offset: number,
  ): Promise<IndexerHitRow[]> {
    try {
      const db = this._db(type);
      const term = q?.trim();
      const params: Record<string, string | number> = { $limit: limit + offset, $offset: 0 };
      if (term) {
        let stmt = this._listSearchQs.get(type);
        if (!stmt) {
          stmt = db.prepare(LIST_SEARCH_SQL);
          this._listSearchQs.set(type, stmt);
        }
        params.$term = `%${escapeLike(term.toLowerCase())}%`;
        return (stmt.all(params) as IndexerHitRow[]).slice(offset);
      }
      let stmt = this._listAllQs.get(type);
      if (!stmt) {
        stmt = db.prepare(LIST_ALL_SQL);
        this._listAllQs.set(type, stmt);
      }
      return (stmt.all(params) as IndexerHitRow[]).slice(offset);
    } catch (err) {
      logger.warn("indexer", `listHitsForType failed for type=${type}`, err);
      return [];
    }
  }

  async countHitsForType(type: string, q: string | undefined): Promise<number> {
    try {
      const db = this._db(type);
      const term = q?.trim();
      if (term) {
        let stmt = this._countSearchQs.get(type);
        if (!stmt) {
          stmt = db.prepare(COUNT_SEARCH_SQL);
          this._countSearchQs.set(type, stmt);
        }
        return (stmt.get({ $term: `%${escapeLike(term.toLowerCase())}%` }) as { c: number }).c;
      }
      let stmt = this._countAllQs.get(type);
      if (!stmt) {
        stmt = db.prepare(COUNT_ALL_SQL);
        this._countAllQs.set(type, stmt);
      }
      return (stmt.get() as { c: number }).c;
    } catch (err) {
      logger.warn("indexer", `countHitsForType failed for type=${type}`, err);
      return 0;
    }
  }

  async sampleRows(type: string, limit: number): Promise<ExportRow[]> {
    try {
      const db = this._db(type);
      let stmt = this._sampleQs.get(type);
      if (!stmt) {
        stmt = db.prepare(`${EXPORT_SELECT_SQL} ORDER BY h.last_seen DESC LIMIT ?`);
        this._sampleQs.set(type, stmt);
      }
      return stmt.all(limit) as ExportRow[];
    } catch (err) {
      logger.warn("indexer", `sampleRows failed for type=${type}`, err);
      return [];
    }
  }

  async *exportBatches(type: string, size: number): AsyncIterable<ExportRow[]> {
    let stmt: Statement;
    try {
      stmt = this._db(type).prepare(EXPORT_SELECT_SQL);
    } catch (err) {
      logger.warn("indexer", `exportBatches failed for type=${type}`, err);
      return;
    }
    let batch: ExportRow[] = [];
    try {
      for (const row of stmt.iterate() as Iterable<ExportRow>) {
        batch.push(row);
        if (batch.length < size) continue;
        yield batch;
        batch = [];
      }
      if (batch.length > 0) yield batch;
    } finally {
      stmt.finalize();
    }
  }

  async deleteHitsForType(type: string, ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const db = this._db(type);
    const placeholders = ids.map(() => "?").join(",");
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM query_hits WHERE id IN (${placeholders})`).run(...ids);
      pruneOrphans(db);
    });
    tx();
  }

  async clearType(type: string): Promise<void> {
    const key = safeSlug(type);
    this._holds.dropType(key);
    const db = this._db(key);
    db.exec("DELETE FROM query_hits");
    db.exec("DELETE FROM urls");
    db.exec("INSERT INTO urls_fts(urls_fts) VALUES('rebuild')");
    db.exec("VACUUM");
    db.close();
    this._dbs.delete(key);
    this._upsertUrlStmts.delete(key);
    this._upsertHitStmts.delete(key);
    this._exactQs.delete(key);
    this._fuzzyQs.delete(key);
    this._listAllQs.delete(key);
    this._listSearchQs.delete(key);
    this._countAllQs.delete(key);
    this._countSearchQs.delete(key);
    this._sampleQs.delete(key);
    const dbFile = indexerDbForType(key);
    for (const file of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) {
      try {
        unlinkSync(file);
      } catch (err) {
        logger.debug("indexer", `clearType: could not delete ${file} for type=${key}`, err);
      }
    }
  }

  async pruneType(type: string, cfg: IndexerConfig): Promise<void> {
    runSqlitePrune(this._db(type), cfg);
  }
}
