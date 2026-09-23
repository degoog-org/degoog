import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createRowImporter } from "../../src/server/indexer/adapters/sqlite/import-rows";
import { EXPORT_SCHEMA_DDL } from "../../src/server/indexer/export/schema";
import type { ExportRow } from "../../src/server/indexer/types/adapter";

const freshDb = (): Database => {
  const db = new Database(":memory:");
  for (const sql of EXPORT_SCHEMA_DDL) db.exec(sql);
  return db;
};

const row = (over: Partial<ExportRow> = {}): ExportRow => ({
  query_norm: "rust",
  engine_type: "images",
  url: "https://a.example/1",
  url_norm: "a.example/1",
  source_engine: "Brave",
  title: "Title",
  snippet: "Snippet",
  thumbnail: "t.png",
  image_url: "i.png",
  is_gif: 0,
  duration: "1:00",
  extras_json: '{"x":1}',
  first_seen: 100,
  last_seen: 200,
  source_instance: null,
  best_position: 3,
  pos_sum: 12,
  hit_count: 4,
  sources_json: '["Brave"]',
  filters_json: '{"f":1}',
  meta_json: '{"m":1}',
  ...over,
});

describe("sqlite row importer", () => {
  test("writes the url and a ranked hit, keeping the row's engine type by default", () => {
    const db = freshDb();
    expect(createRowImporter(db)([row()])).toEqual({ urls: 1, hits: 1 });
    expect(db.prepare("SELECT * FROM urls").all()).toEqual([
      {
        id: 1,
        url_norm: "a.example/1",
        url: "https://a.example/1",
        source_engine: "Brave",
        title: "Title",
        snippet: "Snippet",
        thumbnail: "t.png",
        image_url: "i.png",
        is_gif: 0,
        duration: "1:00",
        extras_json: '{"x":1}',
        first_seen: 100,
        last_seen: 200,
      },
    ]);
    expect(db.prepare("SELECT * FROM query_hits").all()).toEqual([
      {
        id: 1,
        query_norm: "rust",
        engine_type: "images",
        url_id: 1,
        best_position: 3,
        pos_sum: 12,
        hit_count: 4,
        sources_json: '["Brave"]',
        filters_json: '{"f":1}',
        meta_json: '{"m":1}',
        first_seen: 100,
        last_seen: 200,
      },
    ]);
  });

  test("a forced engine type overrides every row's", () => {
    const db = freshDb();
    createRowImporter(db)([row(), row({ query_norm: "go", engine_type: "news" })], "web");
    expect(db.prepare("SELECT DISTINCT engine_type FROM query_hits").all()).toEqual([
      { engine_type: "web" },
    ]);
  });

  test("a known url is reused, not recounted, and duplicate hits are skipped", () => {
    const db = freshDb();
    const importRows = createRowImporter(db);
    importRows([row()]);
    const second = importRows([
      row({ query_norm: "other", title: "ignored" }),
      row(),
    ]);
    expect(second).toEqual({ urls: 0, hits: 1 });
    expect(db.prepare("SELECT url_id, query_norm FROM query_hits ORDER BY id").all()).toEqual([
      { url_id: 1, query_norm: "rust" },
      { url_id: 1, query_norm: "other" },
    ]);
    expect(db.prepare("SELECT title FROM urls").all()).toEqual([{ title: "Title" }]);
  });

  test("missing rank columns fall back to the sentinel ranking", () => {
    const db = freshDb();
    createRowImporter(db)([row({ best_position: null, pos_sum: null, hit_count: null })]);
    expect(
      db.prepare("SELECT best_position, pos_sum, hit_count FROM query_hits").get(),
    ).toEqual({ best_position: 9999, pos_sum: 9999, hit_count: 1 });
  });
});
