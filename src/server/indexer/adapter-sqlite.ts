import { Database, type Statement } from "bun:sqlite";
import { mkdirSync, readdirSync, statSync } from "fs";
import type { IndexRow } from "./recorders";
import type { IndexerConfig } from "./config";
import type { IndexerAdapter, UrlRow, HitRow, TypeCounts, ExportRow } from "./adapter";
import { indexerDir, indexerDbForType } from "../utils/paths";
import { logger } from "../utils/logger";

const SAFE_TYPE = /^[a-z0-9][a-z0-9-]*$/;

const safeSlug = (type: string): string => {
  const slug = type.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (!SAFE_TYPE.test(slug)) throw new Error(`invalid type: ${type}`);
  return slug;
};

const SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_norm TEXT NOT NULL UNIQUE,
    url TEXT NOT NULL,
    source_engine TEXT NOT NULL,
    title TEXT NOT NULL,
    snippet TEXT NOT NULL,
    thumbnail TEXT,
    image_url TEXT,
    is_gif INTEGER,
    duration TEXT,
    extras_json TEXT,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS query_hits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_norm TEXT NOT NULL,
    engine_type TEXT NOT NULL,
    url_id INTEGER NOT NULL REFERENCES urls(id) ON DELETE CASCADE,
    best_position INTEGER NOT NULL DEFAULT 9999,
    hit_count INTEGER NOT NULL DEFAULT 1,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    UNIQUE(query_norm, engine_type, url_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_hits_query_type ON query_hits(query_norm, engine_type)`,
  `CREATE INDEX IF NOT EXISTS idx_hits_type ON query_hits(engine_type)`,
  `CREATE INDEX IF NOT EXISTS idx_hits_last_seen ON query_hits(last_seen)`,
  `CREATE INDEX IF NOT EXISTS idx_urls_last_seen ON urls(last_seen)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS urls_fts USING fts5(
    title, snippet, url,
    content='urls', content_rowid='id'
  )`,
  `CREATE TRIGGER IF NOT EXISTS urls_ai AFTER INSERT ON urls BEGIN
    INSERT INTO urls_fts(rowid, title, snippet, url)
    VALUES (new.id, new.title, new.snippet, new.url);
  END`,
  `CREATE TRIGGER IF NOT EXISTS urls_ad AFTER DELETE ON urls BEGIN
    INSERT INTO urls_fts(urls_fts, rowid, title, snippet, url)
    VALUES('delete', old.id, old.title, old.snippet, old.url);
  END`,
  `CREATE TRIGGER IF NOT EXISTS urls_au AFTER UPDATE ON urls BEGIN
    INSERT INTO urls_fts(urls_fts, rowid, title, snippet, url)
    VALUES('delete', old.id, old.title, old.snippet, old.url);
    INSERT INTO urls_fts(rowid, title, snippet, url)
    VALUES (new.id, new.title, new.snippet, new.url);
  END`,
];

const UPSERT_URL = `
  INSERT INTO urls (
    url_norm, url, source_engine, title, snippet,
    thumbnail, image_url, is_gif, duration, extras_json,
    first_seen, last_seen
  ) VALUES (
    $url_norm, $url, $source_engine, $title, $snippet,
    $thumbnail, $image_url, $is_gif, $duration, $extras_json,
    $first_seen, $last_seen
  )
  ON CONFLICT(url_norm) DO UPDATE SET
    last_seen = excluded.last_seen,
    title = CASE WHEN length(urls.title) >= length(excluded.title) THEN urls.title ELSE excluded.title END,
    snippet = CASE WHEN length(urls.snippet) >= length(excluded.snippet) THEN urls.snippet ELSE excluded.snippet END,
    thumbnail = COALESCE(urls.thumbnail, excluded.thumbnail),
    image_url = COALESCE(urls.image_url, excluded.image_url),
    is_gif = COALESCE(urls.is_gif, excluded.is_gif),
    duration = COALESCE(urls.duration, excluded.duration),
    extras_json = COALESCE(urls.extras_json, excluded.extras_json)
  RETURNING id
`;

const UPSERT_HIT = `
  INSERT INTO query_hits (query_norm, engine_type, url_id, best_position, hit_count, first_seen, last_seen)
  VALUES ($query_norm, $engine_type, $url_id, $best_position, 1, $first_seen, $last_seen)
  ON CONFLICT(query_norm, engine_type, url_id) DO UPDATE SET
    last_seen = excluded.last_seen,
    best_position = MIN(query_hits.best_position, excluded.best_position),
    hit_count = query_hits.hit_count + 1
`;

const IMPORT_URL = `
  INSERT INTO urls (
    url_norm, url, source_engine, title, snippet,
    thumbnail, image_url, is_gif, duration, extras_json,
    first_seen, last_seen
  ) VALUES (
    $url_norm, $url, $source_engine, $title, $snippet,
    $thumbnail, $image_url, $is_gif, $duration, $extras_json,
    $first_seen, $last_seen
  )
  ON CONFLICT(url_norm) DO NOTHING
  RETURNING id
`;

const IMPORT_HIT = `
  INSERT INTO query_hits (query_norm, engine_type, url_id, best_position, hit_count, first_seen, last_seen)
  VALUES ($query_norm, $engine_type, $url_id, 9999, 1, $first_seen, $last_seen)
  ON CONFLICT(query_norm, engine_type, url_id) DO NOTHING
`;

const EXACT_SQL = `
  SELECT u.url, u.source_engine, u.title, u.snippet, u.thumbnail,
         u.image_url, u.is_gif, u.duration, u.extras_json
  FROM query_hits h
  JOIN urls u ON u.id = h.url_id
  WHERE h.query_norm = ? AND h.engine_type = ?
  ORDER BY h.best_position ASC, h.hit_count DESC, h.last_seen DESC
  LIMIT ?
`;

const FUZZY_SQL = `
  SELECT u.url, u.source_engine, u.title, u.snippet, u.thumbnail,
         u.image_url, u.is_gif, u.duration, u.extras_json
  FROM urls_fts f
  JOIN urls u ON u.id = f.rowid
  JOIN query_hits h ON h.url_id = u.id
  WHERE urls_fts MATCH ?
    AND h.engine_type = ?
    AND h.query_norm != ?
  ORDER BY rank, h.last_seen DESC
  LIMIT ?
`;

const LIST_SELECT = `
  SELECT h.id, h.query_norm, h.engine_type, u.url, u.title, u.snippet, h.last_seen
  FROM query_hits h
  JOIN urls u ON u.id = h.url_id
`;

const SEARCH_WHERE = `
  WHERE h.query_norm LIKE $term ESCAPE '\\'
     OR u.url LIKE $term ESCAPE '\\'
     OR u.title LIKE $term ESCAPE '\\'
`;

const EXPORT_SQL = `
  SELECT h.query_norm, h.engine_type, u.url, u.url_norm, u.source_engine,
         u.title, u.snippet, u.thumbnail, u.image_url, u.is_gif, u.duration,
         u.extras_json, h.first_seen, h.last_seen, NULL AS source_instance
  FROM query_hits h
  JOIN urls u ON u.id = h.url_id
`;

const safeFtsTerm = (s: string): string =>
  s.replace(/[^a-z0-9\-]/g, "").trim();

const buildFtsQuery = (queryNorm: string): string => {
  const terms = queryNorm
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map(safeFtsTerm)
    .filter(Boolean);
  return terms.length > 0 ? terms.map((t) => `${t}*`).join(" OR ") : "";
};

const escapeLike = (s: string): string =>
  s.replace(/[\\%_]/g, (ch) => `\\${ch}`);

const pruneOrphans = (db: Database): void => {
  db.exec("DELETE FROM urls WHERE id NOT IN (SELECT url_id FROM query_hits)");
};

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
      for (const sql of SCHEMA_DDL) db.exec(sql);
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
      logger.debug("indexer", "indexer dir discovery failed", err);
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

  async queryExact(type: string, queryNorm: string, limit: number): Promise<UrlRow[]> {
    try {
      const db = this._db(type);
      let stmt = this._exactQs.get(type);
      if (!stmt) {
        stmt = db.prepare(EXACT_SQL);
        this._exactQs.set(type, stmt);
      }
      return stmt.all(queryNorm, type, limit) as UrlRow[];
    } catch (err) {
      logger.warn("indexer", `queryExact failed for type=${type}`, err);
      return [];
    }
  }

  async queryFuzzy(type: string, queryNorm: string, limit: number): Promise<UrlRow[]> {
    const ftsQuery = buildFtsQuery(queryNorm);
    if (!ftsQuery) return [];
    try {
      const db = this._db(type);
      let stmt = this._fuzzyQs.get(type);
      if (!stmt) {
        stmt = db.prepare(FUZZY_SQL);
        this._fuzzyQs.set(type, stmt);
      }
      return stmt.all(ftsQuery, type, queryNorm, limit) as UrlRow[];
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
    const db = this._db(type);
    db.exec("DELETE FROM query_hits");
    db.exec("DELETE FROM urls");
    db.exec("INSERT INTO urls_fts(urls_fts) VALUES('rebuild')");
    db.exec("VACUUM");
  }

  async pruneType(type: string, cfg: IndexerConfig): Promise<void> {
    const db = this._db(type);
    if (cfg.maxAgeDays > 0) {
      const cutoff = Date.now() - cfg.maxAgeDays * 86_400_000;
      db.prepare("DELETE FROM query_hits WHERE last_seen < ?").run(cutoff);
      pruneOrphans(db);
    }
    if (!cfg.pruneEnabled) return;
    if (cfg.maxHits > 0) {
      const row = db.prepare("SELECT COUNT(*) AS c FROM query_hits").get() as { c: number };
      const excess = row.c - cfg.maxHits;
      if (excess > 0) {
        db.prepare(
          `DELETE FROM query_hits WHERE id IN (
            SELECT id FROM query_hits ORDER BY last_seen ASC LIMIT ?
          )`,
        ).run(excess);
        pruneOrphans(db);
      }
    }
    if (cfg.maxUrls > 0) {
      const row = db.prepare("SELECT COUNT(*) AS c FROM urls").get() as { c: number };
      const excess = row.c - cfg.maxUrls;
      if (excess > 0) {
        db.prepare(
          `DELETE FROM urls WHERE id IN (
            SELECT id FROM urls ORDER BY last_seen ASC LIMIT ?
          )`,
        ).run(excess);
      }
    }
  }
}
