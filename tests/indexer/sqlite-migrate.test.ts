import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const SHARED = join(tmpdir(), "degoog-sqlite-migrate-tests");
rmSync(SHARED, { recursive: true, force: true });
mkdirSync(SHARED, { recursive: true });
process.env.DEGOOG_INDEXER_DIR = SHARED;
process.env.DEGOOG_INDEXER_DB = join(SHARED, "index.db");

import { SqliteAdapter } from "../../src/server/indexer/adapters/sqlite/adapter";

const TYPE = "legacy";
const DB_FILE = join(SHARED, `index-${TYPE}.db`);

const LEGACY_DDL = [
  `CREATE TABLE urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_norm TEXT NOT NULL UNIQUE,
    url TEXT NOT NULL,
    source_engine TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    snippet TEXT NOT NULL DEFAULT '',
    thumbnail TEXT,
    image_url TEXT,
    is_gif INTEGER,
    duration TEXT,
    extras_json TEXT,
    first_seen INTEGER NOT NULL DEFAULT 0,
    last_seen INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE query_hits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_norm TEXT NOT NULL,
    engine_type TEXT NOT NULL,
    url_id INTEGER NOT NULL REFERENCES urls(id) ON DELETE CASCADE,
    best_position INTEGER NOT NULL DEFAULT 9999,
    pos_sum INTEGER NOT NULL DEFAULT 9999,
    hit_count INTEGER NOT NULL DEFAULT 1,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
  )`,
];

const seed = (): void => {
  const db = new Database(DB_FILE, { create: true });
  for (const sql of LEGACY_DDL) db.exec(sql);
  db.exec(
    `INSERT INTO urls (id, url_norm, url) VALUES (1, 'example.com/a', 'https://example.com/a')`,
  );
  db.exec(
    `INSERT INTO query_hits (id, query_norm, engine_type, url_id, best_position, pos_sum, hit_count, first_seen, last_seen)
     VALUES (1, 'q', 'web', 1, 2, 17, 4, 1000, 2000)`,
  );
  db.exec("PRAGMA user_version = 0");
  db.close();
};

const posSum = (): number => {
  const db = new Database(DB_FILE, { readonly: true });
  const row = db.prepare("SELECT pos_sum FROM query_hits WHERE id = 1").get() as {
    pos_sum: number;
  };
  db.close();
  return row.pos_sum;
};

describe("sqlite query_hits migration", () => {
  beforeEach(() => {
    rmSync(DB_FILE, { force: true });
  });

  test("keeps cumulative pos_sum when the column already exists", async () => {
    seed();
    const adapter = new SqliteAdapter();
    await adapter.open(TYPE);
    await adapter.close();
    expect(posSum()).toBe(17);
  });

  test("backfills pos_sum only when the column was missing", async () => {
    const db = new Database(DB_FILE, { create: true });
    for (const sql of LEGACY_DDL) db.exec(sql);
    db.exec("ALTER TABLE query_hits DROP COLUMN pos_sum");
    db.exec(
      `INSERT INTO urls (id, url_norm, url) VALUES (1, 'example.com/a', 'https://example.com/a')`,
    );
    db.exec(
      `INSERT INTO query_hits (id, query_norm, engine_type, url_id, best_position, hit_count, first_seen, last_seen)
       VALUES (1, 'q', 'web', 1, 2, 4, 1000, 2000)`,
    );
    db.exec("PRAGMA user_version = 0");
    db.close();

    const adapter = new SqliteAdapter();
    await adapter.open(TYPE);
    await adapter.close();
    expect(posSum()).toBe(8);
  });

  test("leaves an already migrated database untouched", async () => {
    seed();
    const first = new SqliteAdapter();
    await first.open(TYPE);
    await first.close();

    const db = new Database(DB_FILE);
    db.exec("UPDATE query_hits SET pos_sum = 42 WHERE id = 1");
    db.close();

    const second = new SqliteAdapter();
    await second.open(TYPE);
    await second.close();
    expect(posSum()).toBe(42);
  });
});
