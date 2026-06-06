import { Database } from "bun:sqlite";
import { unlinkSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";
import { getAdapter } from "./db-factory";
import { logger } from "../utils/logger";

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
];

export const buildSqliteExport = async (type: string): Promise<Buffer> => {
  const adapter = getAdapter();
  const rows = await adapter.exportRows(type);

  const dir = tmpdir();
  mkdirSync(dir, { recursive: true });
  const tmpPath = join(dir, `degoog-export-${randomBytes(8).toString("hex")}.db`);

  try {
    const db = new Database(tmpPath, { create: true });
    try {
      db.exec("PRAGMA journal_mode = WAL");
      for (const sql of SCHEMA_DDL) db.exec(sql);

      const insertUrl = db.prepare(`
        INSERT INTO urls (url_norm, url, source_engine, title, snippet,
          thumbnail, image_url, is_gif, duration, extras_json, first_seen, last_seen)
        VALUES ($url_norm, $url, $source_engine, $title, $snippet,
          $thumbnail, $image_url, $is_gif, $duration, $extras_json, $first_seen, $last_seen)
        ON CONFLICT(url_norm) DO NOTHING
        RETURNING id
      `);
      const insertHit = db.prepare(`
        INSERT INTO query_hits (query_norm, engine_type, url_id, best_position, hit_count, first_seen, last_seen)
        VALUES ($query_norm, $engine_type, $url_id, 9999, 1, $first_seen, $last_seen)
        ON CONFLICT(query_norm, engine_type, url_id) DO NOTHING
      `);
      const selectUrl = db.prepare("SELECT id FROM urls WHERE url_norm = ?");

      const tx = db.transaction(() => {
        for (const row of rows) {
          const inserted = insertUrl.get({
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

          const urlId =
            inserted?.id ?? (selectUrl.get(row.url_norm) as { id: number } | null)?.id;
          if (!urlId) continue;

          insertHit.run({
            $query_norm: row.query_norm,
            $engine_type: row.engine_type,
            $url_id: urlId,
            $first_seen: row.first_seen,
            $last_seen: row.last_seen,
          });
        }
      });

      tx();
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } finally {
      db.close();
    }

    const buf = await Bun.file(tmpPath).arrayBuffer();
    return Buffer.from(buf);
  } catch (err) {
    logger.error("indexer", `export-builder failed for type=${type}`, err);
    throw err;
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch {
      // best-effort cleanup
    }
  }
};
