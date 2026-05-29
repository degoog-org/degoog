import { Database } from "bun:sqlite";
import { mkdirSync, readdirSync } from "fs";
import { indexerDir, indexerDbForType } from "../utils/paths";
import { logger } from "../utils/logger";

const _dbs = new Map<string, Database>();

const SAFE_TYPE = /^[a-z0-9][a-z0-9-]*$/;

const safeType = (type: string): string => {
  const slug = type.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (!SAFE_TYPE.test(slug)) throw new Error(`invalid type: ${type}`);
  return slug;
};

const MIGRATIONS = [
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

const migrate = (db: Database): void => {
  for (const sql of MIGRATIONS) db.exec(sql);
};

const openDb = (type: string): Database => {
  mkdirSync(indexerDir(), { recursive: true });
  const db = new Database(indexerDbForType(type), { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  try {
    migrate(db);
  } catch (err) {
    logger.error("indexer", `schema init failed for type=${type}`, err);
    throw err;
  }
  return db;
};

export const getDbForType = (type: string): Database => {
  const key = safeType(type);
  const existing = _dbs.get(key);
  if (existing) return existing;
  const db = openDb(key);
  _dbs.set(key, db);
  return db;
};

export const discoverTypes = (): string[] => {
  try {
    return readdirSync(indexerDir())
      .filter((f) => f.startsWith("index-") && f.endsWith(".db"))
      .map((f) => f.slice(6, -3));
  } catch {
    return [];
  }
};

export const checkpointType = (type: string): void => {
  const db = _dbs.get(safeType(type));
  if (!db) return;
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch (err) {
    logger.warn("indexer", `wal checkpoint failed for type=${type}`, err);
  }
};

export const closeAllDbs = (): void => {
  for (const [type, db] of _dbs) {
    try {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      db.close();
    } catch (err) {
      logger.warn("indexer", `close failed for type=${type}`, err);
    }
  }
  _dbs.clear();
};
