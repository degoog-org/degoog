import { Database, type Statement } from "bun:sqlite";
import { mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import type { IndexRow } from "../../recorders";
import type { IndexerConfig } from "../../types/config";
import type { IndexerAdapter, UrlRow, HitRow, TypeCounts, ExportRow } from "../../types/adapter";
import { safeSlug } from "../../shared/safe-type";
import { indexerDir, indexerDbForType } from "../../../utils/paths";
import { logger } from "../../../utils/logger";
import { SQLITE_SCHEMA_DDL } from "./schema";
import {
  UPSERT_URL,
  UPSERT_HIT,
  IMPORT_URL,
  IMPORT_HIT,
  EXACT_SQL,
  FUZZY_SQL,
  LIST_SELECT,
  SEARCH_WHERE,
  EXPORT_SQL,
} from "./statements";
import { buildFtsQuery, escapeLike } from "./fts";
import { pruneOrphans, runSqlitePrune } from "./prune";

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
    try {
      for (const sql of SQLITE_SCHEMA_DDL) db.exec(sql);
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

  async checkpoint(type: string): Promise<void> {
    const db = this._dbs.get(safeSlug(type));
    if (!db) return;
    try {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch (err) {
      logger.warn("indexer", `checkpoint failed for type=${type}`, err);
    }
  }

  async writeBatch(type: string, rows: IndexRow[], now: number): Promise<void> {
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
        const urlIdRow = upsertUrl!.get({
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
          $first_seen: now,
          $last_seen: now,
        }) as { id: number };
        upsertHit!.run({
          $query_norm: row.query_norm,
          $engine_type: row.engine_type,
          $url_id: urlIdRow.id,
          $best_position: row.position,
          $first_seen: now,
          $last_seen: now,
        });
      }
    });
    tx(rows);
  }

  async importRows(type: string, rows: ExportRow[]): Promise<{ urls: number; hits: number }> {
    const db = this._db(type);
    const importUrl = db.prepare(IMPORT_URL);
    const importHit = db.prepare(IMPORT_HIT);
    let urlsInserted = 0;
    let hitsInserted = 0;
    const tx = db.transaction((batch: ExportRow[]) => {
      for (const row of batch) {
        const urlRow = importUrl.get({
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
          $first_seen: row.first_seen,
          $last_seen: row.last_seen,
        }) as { id: number } | null;
        if (urlRow) urlsInserted++;
        const urlId = urlRow?.id ?? (
          db.prepare("SELECT id FROM urls WHERE url_norm = ?").get(row.url_norm) as { id: number } | null
        )?.id;
        if (!urlId) continue;
        const hitResult = importHit.run({
          $query_norm: row.query_norm,
          $engine_type: type,
          $url_id: urlId,
          $first_seen: row.first_seen,
          $last_seen: row.last_seen,
        });
        if (hitResult.changes > 0) hitsInserted++;
      }
    });
    tx(rows);
    return { urls: urlsInserted, hits: hitsInserted };
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
      return stmt.all(ftsQuery, type, queryNorm, limit, offset) as UrlRow[];
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
        // file may not be flushed to disk yet
      }
    }
    return total;
  }

  async listHitsForType(
    type: string,
    q: string | undefined,
    limit: number,
    offset: number,
  ): Promise<HitRow[]> {
    try {
      const db = this._db(type);
      const term = q?.trim();
      const params: Record<string, string | number> = { $limit: limit + offset, $offset: 0 };
      if (term) {
        let stmt = this._listSearchQs.get(type);
        if (!stmt) {
          stmt = db.prepare(
            `${LIST_SELECT} ${SEARCH_WHERE} ORDER BY h.last_seen DESC LIMIT $limit OFFSET $offset`,
          );
          this._listSearchQs.set(type, stmt);
        }
        params.$term = `%${escapeLike(term.toLowerCase())}%`;
        return (stmt.all(params) as HitRow[]).slice(offset);
      }
      let stmt = this._listAllQs.get(type);
      if (!stmt) {
        stmt = db.prepare(
          `${LIST_SELECT} ORDER BY h.last_seen DESC LIMIT $limit OFFSET $offset`,
        );
        this._listAllQs.set(type, stmt);
      }
      return (stmt.all(params) as HitRow[]).slice(offset);
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
          stmt = db.prepare(
            `SELECT COUNT(*) AS c FROM query_hits h JOIN urls u ON u.id = h.url_id ${SEARCH_WHERE}`,
          );
          this._countSearchQs.set(type, stmt);
        }
        return (stmt.get({ $term: `%${escapeLike(term.toLowerCase())}%` }) as { c: number }).c;
      }
      let stmt = this._countAllQs.get(type);
      if (!stmt) {
        stmt = db.prepare(
          "SELECT COUNT(*) AS c FROM query_hits h JOIN urls u ON u.id = h.url_id",
        );
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
        stmt = db.prepare(`${EXPORT_SQL} ORDER BY h.last_seen DESC LIMIT ?`);
        this._sampleQs.set(type, stmt);
      }
      return stmt.all(limit) as ExportRow[];
    } catch (err) {
      logger.warn("indexer", `sampleRows failed for type=${type}`, err);
      return [];
    }
  }

  async exportRows(type: string): Promise<ExportRow[]> {
    try {
      const db = this._db(type);
      return db.prepare(EXPORT_SQL).all() as ExportRow[];
    } catch (err) {
      logger.warn("indexer", `exportRows failed for type=${type}`, err);
      return [];
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
    try {
      unlinkSync(indexerDbForType(key));
    } catch (err) {
      logger.warn("indexer", `clearType: could not delete db file for type=${key}`, err);
    }
  }

  async pruneType(type: string, cfg: IndexerConfig): Promise<void> {
    runSqlitePrune(this._db(type), cfg);
  }
}
