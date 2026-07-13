import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const SHARED = join(tmpdir(), "degoog-indexer-tests");
mkdirSync(SHARED, { recursive: true });
process.env.DEGOOG_INDEXER_DIR = SHARED;
process.env.DEGOOG_INDEXER_DB = join(SHARED, "index.db");
process.env.DEGOOG_SERVER_SETTINGS_FILE = join(SHARED, "server-settings.json");

import {
  clearAll,
  countHits,
  deleteHits,
  getStats,
  listHits,
  queryIndex,
  recordResults,
  wipeStatsCache,
} from "../../src/server/indexer/store";
import { flushQueue, prunePass } from "../../src/server/indexer/queue";
import { setInstanceSettings } from "../../src/server/utils/server-settings";
import type { SearchResult } from "../../src/server/types";

const TYPE = "web";

const mk = (n: number, host = "example.com"): SearchResult => ({
  title: `Title ${n}`,
  url: `https://${host}/page-${n}`,
  snippet: `snippet ${n}`,
  source: "TestEngine",
});

interface RawHit {
  sources_json: string | null;
  filters_json: string | null;
  meta_json: string | null;
  pos_sum: number;
  hit_count: number;
  best_position: number;
}

const readHit = (type: string, urlPart: string): RawHit | null => {
  const db = new Database(join(SHARED, `index-${type}.db`), { readonly: true });
  try {
    return db
      .prepare(
        `SELECT h.sources_json, h.filters_json, h.meta_json,
                h.pos_sum, h.hit_count, h.best_position
         FROM query_hits h JOIN urls u ON u.id = h.url_id
         WHERE u.url LIKE ?`,
      )
      .get(`%${urlPart}%`) as RawHit | null;
  } finally {
    db.close();
  }
};

const targetAt = (target: SearchResult, pos: number): SearchResult[] => {
  const rows: SearchResult[] = [];
  for (let i = 0; i < pos; i++) rows.push(mk(1000 + i, `filler${i}.test`));
  rows.push(target);
  return rows;
};

const orderOf = (urls: string[], part: string): number =>
  urls.findIndex((u) => u.includes(part));

const baseSettings = async (over: Record<string, string> = {}): Promise<void> => {
  await setInstanceSettings({
    degoogIndexerEnabled: "true",
    degoogIndexerMaxPerSearch: "30",
    degoogIndexerMaxUrls: "0",
    degoogIndexerMaxHits: "0",
    degoogIndexerPruneEnabled: "true",
    degoogIndexerFuzzyEnabled: "false",
    degoogIndexerQueryLimit: "30",
    ...over,
  });
};

describe("indexer store", () => {
  beforeAll(async () => {
    await baseSettings();
    await clearAll();
  });

  beforeEach(async () => {
    await baseSettings();
    await clearAll();
  });

  test("records results and returns them on exact query", async () => {
    await recordResults("cats", TYPE, [mk(1), mk(2)]);
    await flushQueue();
    const out = await queryIndex("cats", TYPE);
    expect(out.length).toBe(2);
    expect(out.map((r) => r.url).sort()).toEqual([
      "https://example.com/page-1",
      "https://example.com/page-2",
    ]);
    expect(out[0].source).toBe("Degoog");
  });

  test("normalizes the query (case/whitespace)", async () => {
    await recordResults("  Hello   World ", TYPE, [mk(1)]);
    await flushQueue();
    const out = await queryIndex("hello world", TYPE);
    expect(out.length).toBe(1);
  });

  test("caps stored results to maxPerSearch", async () => {
    await baseSettings({ degoogIndexerMaxPerSearch: "2" });
    await recordResults("dogs", TYPE, [mk(1), mk(2), mk(3), mk(4), mk(5)]);
    await flushQueue();
    const out = await queryIndex("dogs", TYPE);
    expect(out.length).toBe(2);
  });

  test("applies record-time domain blocklist", async () => {
    await baseSettings({ degoogIndexerDomainBlocklist: "blocked.com" });
    await recordResults("mixed", TYPE, [
      mk(1, "good.com"),
      mk(2, "blocked.com"),
    ]);
    await flushQueue();
    const out = await queryIndex("mixed", TYPE);
    expect(out.length).toBe(1);
    expect(out[0].url).toContain("good.com");
  });

  test("prune removes orphan urls when hit cap exceeded", async () => {
    await baseSettings({ degoogIndexerMaxHits: "1" });
    await recordResults("kittens", TYPE, [mk(1), mk(2)]);
    await flushQueue();
    await prunePass();
    wipeStatsCache();
    const stats = await getStats();
    expect(stats.totalHits).toBe(1);
    expect(stats.totalUrls).toBe(1);
  });

  test("deleteHits removes the hit and orphaned url", async () => {
    await recordResults("solo", TYPE, [mk(1)]);
    await flushQueue();
    const rows = await listHits({ limit: 10, offset: 0 });
    expect(rows.length).toBe(1);
    const deleted = await deleteHits([{ id: rows[0].id, engine_type: rows[0].engine_type }]);
    expect(deleted).toBe(1);
    wipeStatsCache();
    const stats = await getStats();
    expect(stats.totalHits).toBe(0);
    expect(stats.totalUrls).toBe(0);
  });

  test("listHits/countHits support search and pagination", async () => {
    await recordResults("alpha query", TYPE, [mk(1, "alpha.com")]);
    await recordResults("beta query", TYPE, [mk(2, "beta.com")]);
    await recordResults("gamma other", TYPE, [mk(3, "gamma.com")]);
    await flushQueue();

    expect(await countHits()).toBe(3);
    expect(await countHits("query")).toBe(2);
    expect(await countHits("alpha.com")).toBe(1);

    const firstPage = await listHits({ limit: 2, offset: 0 });
    const secondPage = await listHits({ limit: 2, offset: 2 });
    expect(firstPage.length).toBe(2);
    expect(secondPage.length).toBe(1);
  });

  test("serves a stable, position-ordered result set across calls", async () => {
    await recordResults("stable", TYPE, [mk(1), mk(2), mk(3)]);
    await flushQueue();
    const first = (await queryIndex("stable", TYPE)).map((r) => r.url);
    const second = (await queryIndex("stable", TYPE)).map((r) => r.url);
    expect(first).toEqual(second);
    expect(first).toEqual([
      "https://example.com/page-1",
      "https://example.com/page-2",
      "https://example.com/page-3",
    ]);
  });

  test("ranks by average position, not a single fluke placement", async () => {
    const steady = mk(1, "steady.test");
    const fluke = mk(2, "fluke.test");
    await recordResults("rank", TYPE, targetAt(steady, 5));
    await recordResults("rank", TYPE, targetAt(steady, 5));
    await recordResults("rank", TYPE, targetAt(fluke, 0));
    await recordResults("rank", TYPE, targetAt(fluke, 20));
    await flushQueue();

    const urls = (await queryIndex("rank", TYPE, 100)).map((r) => r.url);
    const steadyIdx = orderOf(urls, "steady.test");
    const flukeIdx = orderOf(urls, "fluke.test");
    expect(steadyIdx).toBeGreaterThanOrEqual(0);
    expect(flukeIdx).toBeGreaterThanOrEqual(0);
    expect(steadyIdx).toBeLessThan(flukeIdx);
  });

  test("tags hits with the active filters and backfills retroactively", async () => {
    const u = mk(1, "tagme.test");
    await recordResults("tagq", TYPE, [u], null);
    await flushQueue();
    expect(readHit(TYPE, "tagme.test")?.filters_json).toBeNull();

    await recordResults("tagq", TYPE, [u], JSON.stringify({ lang: "fr" }));
    await flushQueue();
    expect(JSON.parse(readHit(TYPE, "tagme.test")!.filters_json!)).toEqual({
      lang: "fr",
    });

    await recordResults("tagq", TYPE, [u], null);
    await flushQueue();
    expect(JSON.parse(readHit(TYPE, "tagme.test")!.filters_json!)).toEqual({
      lang: "fr",
    });
  });

  test("unions the source engines that produced a url", async () => {
    await recordResults("srcq", TYPE, [{ ...mk(1, "multi.test"), source: "Alpha" }]);
    await flushQueue();
    await recordResults("srcq", TYPE, [{ ...mk(1, "multi.test"), source: "Beta" }]);
    await flushQueue();

    const sources = JSON.parse(readHit(TYPE, "multi.test")!.sources_json!) as string[];
    expect(sources.sort()).toEqual(["Alpha", "Beta"]);
  });

  test("migrates a legacy db: adds columns and backfills pos_sum", async () => {
    const legacyType = "legacymig";
    const path = join(SHARED, `index-${legacyType}.db`);
    rmSync(path, { force: true });
    const seed = new Database(path, { create: true });
    seed.exec(
      `CREATE TABLE urls (id INTEGER PRIMARY KEY AUTOINCREMENT,
        url_norm TEXT UNIQUE, url TEXT, source_engine TEXT, title TEXT,
        snippet TEXT, thumbnail TEXT, image_url TEXT, is_gif INTEGER,
        duration TEXT, extras_json TEXT, first_seen INTEGER, last_seen INTEGER)`,
    );
    seed.exec(
      `CREATE TABLE query_hits (id INTEGER PRIMARY KEY AUTOINCREMENT,
        query_norm TEXT, engine_type TEXT, url_id INTEGER,
        best_position INTEGER, hit_count INTEGER,
        first_seen INTEGER, last_seen INTEGER,
        UNIQUE(query_norm, engine_type, url_id))`,
    );
    seed.exec(
      `CREATE VIRTUAL TABLE urls_fts USING fts5(
        title, snippet, url, content='urls', content_rowid='id')`,
    );
    seed.exec(
      `CREATE TRIGGER urls_ai AFTER INSERT ON urls BEGIN
        INSERT INTO urls_fts(rowid, title, snippet, url)
        VALUES (new.id, new.title, new.snippet, new.url);
      END`,
    );
    seed.exec(
      `INSERT INTO urls (url_norm, url, source_engine, title, snippet, first_seen, last_seen)
       VALUES ('legacy.test/x', 'https://legacy.test/x', 'E', 'T', 'S', 1, 1)`,
    );
    seed.exec(
      `INSERT INTO query_hits (query_norm, engine_type, url_id, best_position, hit_count, first_seen, last_seen)
       VALUES ('legacyq', '${legacyType}', 1, 3, 2, 1, 1)`,
    );
    seed.exec("PRAGMA user_version = 0");
    seed.close();

    const out = await queryIndex("legacyq", legacyType);
    expect(out.length).toBe(1);
    expect(out[0].url).toContain("legacy.test");

    const row = readHit(legacyType, "legacy.test")!;
    expect(row.pos_sum).toBe(row.best_position * row.hit_count);
    expect(row.pos_sum).toBe(6);
  });
});
