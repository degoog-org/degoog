import { describe, test, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import { useIndexerDir } from "../helpers/indexer-env";

useIndexerDir("degoog-indexer-contract-");

import { SqliteAdapter } from "../../src/server/indexer/adapters/sqlite/adapter";
import { PgAdapter } from "../../src/server/indexer/adapters/postgres/adapter";
import type { ExportRow, IndexerAdapter, UrlRow } from "../../src/server/indexer/types/adapter";
import type { IndexRow } from "../../src/server/indexer/recorders/default";
import type { IndexerConfig } from "../../src/server/indexer/types/config";

const PG_URL = process.env.DEGOOG_TEST_POSTGRES;
const STAMP = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
const DAY_MS = 86_400_000;
const WINDOW = 10;

interface AdapterCase {
  name: string;
  enabled: boolean;
  make: () => IndexerAdapter;
}

const CASES: AdapterCase[] = [
  { name: "sqlite", enabled: true, make: () => new SqliteAdapter() },
  { name: "postgres", enabled: Boolean(PG_URL), make: () => new PgAdapter(PG_URL!) },
];

const row = (type: string, over: Partial<IndexRow> = {}): IndexRow => {
  const url = over.url ?? "https://example.com/a";
  return {
    query_norm: "rust",
    engine_type: type,
    url,
    url_norm: url.replace(/^https?:\/\//, ""),
    source_engine: "TestEngine",
    title: "Title",
    snippet: "Snippet",
    thumbnail: null,
    image_url: null,
    is_gif: null,
    duration: null,
    extras_json: null,
    position: 1,
    sources_json: '["TestEngine"]',
    filters_json: null,
    meta_json: null,
    ...over,
  };
};

const exportRow = (over: Partial<ExportRow> = {}): ExportRow => ({
  query_norm: "rust",
  engine_type: "somewhere-else",
  url: "https://import.example/1",
  url_norm: "import.example/1",
  source_engine: "Brave",
  title: "Imported",
  snippet: "imported snippet",
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

const config = (over: Partial<IndexerConfig> = {}): IndexerConfig => ({
  maxPerSearch: 30,
  maxUrls: 0,
  maxHits: 0,
  maxAgeDays: 0,
  pruneEnabled: true,
  fuzzyEnabled: true,
  fuzzyMinTermRatio: 0,
  queryLimit: 30,
  rankingWindow: WINDOW,
  domainAllowlist: new Set(),
  domainBlocklist: new Set(),
  wordBlocklist: [],
  ...over,
});

const urlsOf = (rows: UrlRow[]): string[] => rows.map((r) => r.url);

const drain = async (it: AsyncIterable<ExportRow[]>): Promise<ExportRow[][]> => {
  const batches: ExportRow[][] = [];
  for await (const batch of it) batches.push(batch);
  return batches;
};

const exportedFor = async (
  adapter: IndexerAdapter,
  type: string,
  url: string,
): Promise<ExportRow | undefined> =>
  (await drain(adapter.exportBatches(type, 100))).flat().find((r) => r.url === url);

function adapterContract(c: AdapterCase): void {
  describe.skipIf(!c.enabled)(`indexer adapter contract: ${c.name}`, () => {
    const TYPE = `ctra${STAMP}`;
    const OTHER = `ctrb${STAMP}`;
    let adapter: IndexerAdapter;

    const write = (type: string, rows: IndexRow[], now = Date.now()): Promise<void> =>
      adapter.writeBatch(type, rows, now, WINDOW);

    beforeAll(async () => {
      adapter = c.make();
      await adapter.boot();
    });

    beforeEach(async () => {
      await adapter.clearType(TYPE);
      await adapter.clearType(OTHER);
      await adapter.open(TYPE);
      await adapter.open(OTHER);
    });

    afterAll(async () => {
      if (!adapter) return;
      await adapter.clearType(TYPE);
      await adapter.clearType(OTHER);
      await adapter.close();
    });

    describe("lifecycle", () => {
      test("open is idempotent and the type shows up in discoverTypes", async () => {
        await adapter.open(TYPE);
        expect(adapter.discoverTypes()).toEqual(expect.arrayContaining([TYPE, OTHER]));
      });

      test("open rejects a type that cannot become a safe slug", async () => {
        await expect(adapter.open("!!!")).rejects.toThrow();
      });

      test("a freshly opened type is empty", async () => {
        expect(await adapter.getTypeCounts(TYPE)).toEqual({ hits: 0, urls: 0, queries: 0 });
        expect(await adapter.queryExact(TYPE, "rust", 10)).toEqual([]);
        expect(await adapter.countHitsForType(TYPE, undefined)).toBe(0);
      });

    });

    describe("writeBatch + queryExact", () => {
      test("returns the stored url fields", async () => {
        await write(TYPE, [
          row(TYPE, {
            url: "https://example.com/full",
            title: "Full",
            snippet: "All fields",
            thumbnail: "thumb.png",
            image_url: "img.png",
            is_gif: 1,
            duration: "3:21",
            extras_json: '{"k":"v"}',
          }),
        ]);
        expect(await adapter.queryExact(TYPE, "rust", 10)).toEqual([
          {
            url: "https://example.com/full",
            source_engine: "TestEngine",
            title: "Full",
            snippet: "All fields",
            thumbnail: "thumb.png",
            image_url: "img.png",
            is_gif: 1,
            duration: "3:21",
            extras_json: '{"k":"v"}',
          },
        ]);
      });

      test("orders by average position and honours limit/offset", async () => {
        await write(TYPE, [
          row(TYPE, { url: "https://example.com/third", position: 2 }),
          row(TYPE, { url: "https://example.com/first", position: 1 }),
          row(TYPE, { url: "https://example.com/second", position: 4 }),
        ]);
        await write(TYPE, [row(TYPE, { url: "https://example.com/third", position: 10 })]);
        const all = urlsOf(await adapter.queryExact(TYPE, "rust", 10));
        expect(all).toEqual([
          "https://example.com/first",
          "https://example.com/second",
          "https://example.com/third",
        ]);
        expect(urlsOf(await adapter.queryExact(TYPE, "rust", 1, 1))).toEqual([
          "https://example.com/second",
        ]);
      });

      test("is scoped to the exact query and the type", async () => {
        await write(TYPE, [
          row(TYPE, { url: "https://example.com/rust" }),
          row(TYPE, { query_norm: "rust lang", url: "https://example.com/lang" }),
        ]);
        await write(OTHER, [row(OTHER, { url: "https://example.com/other" })]);
        expect(urlsOf(await adapter.queryExact(TYPE, "rust", 10))).toEqual([
          "https://example.com/rust",
        ]);
        expect(urlsOf(await adapter.queryExact(OTHER, "rust", 10))).toEqual([
          "https://example.com/other",
        ]);
        expect(await adapter.queryExact(TYPE, "go", 10)).toEqual([]);
      });

      test("re-seeing a url merges into one url and one hit", async () => {
        await write(TYPE, [row(TYPE, { title: "Short", snippet: "s", thumbnail: null })], 1000);
        await write(
          TYPE,
          [row(TYPE, { title: "A much longer title", snippet: "x", thumbnail: "late.png" })],
          2000,
        );
        expect(await adapter.getTypeCounts(TYPE)).toEqual({ hits: 1, urls: 1, queries: 1 });
        const [only] = await adapter.queryExact(TYPE, "rust", 10);
        expect(only.title).toBe("A much longer title");
        expect(only.snippet).toBe("s");
        expect(only.thumbnail).toBe("late.png");
      });

      test("keeps the first non-null media fields", async () => {
        await write(TYPE, [row(TYPE, { thumbnail: "first.png", duration: "1:00" })]);
        await write(TYPE, [row(TYPE, { thumbnail: "second.png", duration: "2:00" })]);
        const [only] = await adapter.queryExact(TYPE, "rust", 10);
        expect(only.thumbnail).toBe("first.png");
        expect(only.duration).toBe("1:00");
      });

      test("ranks hits over a sliding window and unions sources", async () => {
        const url = "https://example.com/a";
        await adapter.writeBatch(TYPE, [row(TYPE, { position: 4, sources_json: '["A"]' })], 1000, 2);
        await adapter.writeBatch(TYPE, [row(TYPE, { position: 2, sources_json: '["B"]' })], 2000, 2);
        await adapter.writeBatch(TYPE, [row(TYPE, { position: 6, sources_json: '["A","C"]' })], 3000, 2);
        const hit = await exportedFor(adapter, TYPE, url);
        expect(hit).toBeDefined();
        expect(Number(hit!.best_position)).toBe(2);
        expect(Number(hit!.hit_count)).toBe(2);
        expect(Number(hit!.pos_sum)).toBe(9);
        expect(Number(hit!.first_seen)).toBe(1000);
        expect(Number(hit!.last_seen)).toBe(3000);
        expect((JSON.parse(hit!.sources_json!) as string[]).sort()).toEqual(["A", "B", "C"]);
      });

      test("newer filters win, existing meta sticks", async () => {
        const url = "https://example.com/a";
        await write(TYPE, [row(TYPE, { filters_json: '{"v":1}', meta_json: '{"m":1}' })]);
        await write(TYPE, [row(TYPE, { filters_json: '{"v":2}', meta_json: '{"m":2}' })]);
        await write(TYPE, [row(TYPE, { filters_json: "", meta_json: null })]);
        const hit = await exportedFor(adapter, TYPE, url);
        expect(hit!.filters_json).toBe('{"v":2}');
        expect(hit!.meta_json).toBe('{"m":1}');
      });

      test("shares one url row across queries", async () => {
        await write(TYPE, [
          row(TYPE, { query_norm: "one" }),
          row(TYPE, { query_norm: "two" }),
        ]);
        expect(await adapter.getTypeCounts(TYPE)).toEqual({ hits: 2, urls: 1, queries: 2 });
      });
    });

    describe("queryFuzzy", () => {
      beforeEach(async () => {
        await write(TYPE, [
          row(TYPE, { query_norm: "rust book", url: "https://example.com/book", title: "The Rust Book", snippet: "learn rust" }),
          row(TYPE, { query_norm: "python", url: "https://example.com/py", title: "Python docs", snippet: "snakes" }),
        ]);
      });

      test("finds urls recorded under other queries by word and prefix", async () => {
        expect(urlsOf(await adapter.queryFuzzy(TYPE, "rust", 10))).toEqual(["https://example.com/book"]);
        expect(urlsOf(await adapter.queryFuzzy(TYPE, "rus", 10))).toEqual(["https://example.com/book"]);
      });

      test("requires every term", async () => {
        expect(await adapter.queryFuzzy(TYPE, "rust snakes", 10)).toEqual([]);
      });

      test("excludes urls only recorded under the same query", async () => {
        expect(await adapter.queryFuzzy(TYPE, "rust book", 10)).toEqual([]);
      });

      test("is scoped to the type", async () => {
        expect(await adapter.queryFuzzy(OTHER, "rust", 10)).toEqual([]);
      });

      test("returns nothing for a query without word characters", async () => {
        expect(await adapter.queryFuzzy(TYPE, "!!! ???", 10)).toEqual([]);
      });
    });

    describe("querySubstring", () => {
      beforeEach(async () => {
        await write(TYPE, [
          row(TYPE, { query_norm: "seed", url: "https://example.com/t", title: "Typescript handbook", snippet: "" }),
          row(TYPE, { query_norm: "seed", url: "https://example.com/s", title: "Other", snippet: "about javascript" }),
          row(TYPE, { query_norm: "seed", url: "https://example.com/n", title: "Nothing", snippet: "here" }),
        ]);
      });

      test("matches any needle inside title or snippet", async () => {
        const out = urlsOf(await adapter.querySubstring(TYPE, "q", ["script"], 10)).sort();
        expect(out).toEqual(["https://example.com/s", "https://example.com/t"]);
        expect(urlsOf(await adapter.querySubstring(TYPE, "q", ["handbook", "here"], 10)).sort()).toEqual([
          "https://example.com/n",
          "https://example.com/t",
        ]);
      });

      test("excludes urls only recorded under the same query", async () => {
        expect(await adapter.querySubstring(TYPE, "seed", ["script"], 10)).toEqual([]);
      });

      test("returns nothing without needles", async () => {
        expect(await adapter.querySubstring(TYPE, "q", [], 10)).toEqual([]);
      });
    });

    describe("hit listing", () => {
      beforeEach(async () => {
        await write(TYPE, [
          row(TYPE, { query_norm: "beta", url: "https://example.com/b2", position: 5 }),
          row(TYPE, { query_norm: "beta", url: "https://example.com/b1", position: 1 }),
          row(TYPE, { query_norm: "alpha", url: "https://example.com/a1", title: "Snake_case Guide" }),
          row(TYPE, { query_norm: "gamma", url: "https://example.com/g1", title: "Percent 100% sure" }),
        ], 5000);
      });

      test("rows carry numeric ids and the documented shape", async () => {
        const rows = await adapter.listHitsForType(TYPE, undefined, 10, 0);
        expect(rows.length).toBe(4);
        for (const r of rows) {
          expect(typeof r.id).toBe("number");
          expect(typeof r.last_seen).toBe("number");
          expect(typeof r.score).toBe("number");
          expect(r.engine_type).toBe(TYPE);
        }
        expect(rows.find((r) => r.url === "https://example.com/b2")).toMatchObject({
          query_norm: "beta",
          title: "Title",
          snippet: "Snippet",
          last_seen: 5000,
          score: 5,
        });
      });

      test("orders by query then score, with limit/offset", async () => {
        const all = await adapter.listHitsForType(TYPE, undefined, 10, 0);
        expect(all.map((r) => r.url)).toEqual([
          "https://example.com/a1",
          "https://example.com/b1",
          "https://example.com/b2",
          "https://example.com/g1",
        ]);
        const page = await adapter.listHitsForType(TYPE, undefined, 2, 1);
        expect(page.map((r) => r.url)).toEqual(["https://example.com/b1", "https://example.com/b2"]);
      });

      test("search matches query, url or title case-insensitively and counts agree", async () => {
        const byQuery = await adapter.listHitsForType(TYPE, "BETA", 10, 0);
        expect(byQuery.map((r) => r.url)).toEqual(["https://example.com/b1", "https://example.com/b2"]);
        expect(await adapter.countHitsForType(TYPE, "BETA")).toBe(2);
        expect((await adapter.listHitsForType(TYPE, "/g1", 10, 0)).map((r) => r.url)).toEqual([
          "https://example.com/g1",
        ]);
        expect((await adapter.listHitsForType(TYPE, "snake", 10, 0)).map((r) => r.url)).toEqual([
          "https://example.com/a1",
        ]);
        expect(await adapter.countHitsForType(TYPE, undefined)).toBe(4);
        expect(await adapter.countHitsForType(TYPE, "   ")).toBe(4);
      });

      test("search treats LIKE wildcards literally", async () => {
        expect((await adapter.listHitsForType(TYPE, "e_c", 10, 0)).map((r) => r.url)).toEqual([
          "https://example.com/a1",
        ]);
        expect(await adapter.countHitsForType(TYPE, "e_c")).toBe(1);
        expect((await adapter.listHitsForType(TYPE, "0%", 10, 0)).map((r) => r.url)).toEqual([
          "https://example.com/g1",
        ]);
        expect(await adapter.countHitsForType(TYPE, "%")).toBe(1);
      });
    });

    describe("deleteHitsForType", () => {
      test("deletes by listed id and drops orphaned urls only", async () => {
        await write(TYPE, [
          row(TYPE, { query_norm: "one", url: "https://example.com/shared" }),
          row(TYPE, { query_norm: "two", url: "https://example.com/shared" }),
          row(TYPE, { query_norm: "one", url: "https://example.com/solo" }),
        ]);
        const victims = (await adapter.listHitsForType(TYPE, undefined, 10, 0))
          .filter((r) => r.query_norm === "one")
          .map((r) => r.id);
        await adapter.deleteHitsForType(TYPE, victims);
        expect(await adapter.getTypeCounts(TYPE)).toEqual({ hits: 1, urls: 1, queries: 1 });
        expect(urlsOf(await adapter.queryExact(TYPE, "two", 10))).toEqual(["https://example.com/shared"]);
      });

      test("an empty id list is a no-op", async () => {
        await write(TYPE, [row(TYPE)]);
        await adapter.deleteHitsForType(TYPE, []);
        expect((await adapter.getTypeCounts(TYPE)).hits).toBe(1);
      });
    });

    describe("importRows", () => {
      test("inserts urls and hits under the target type with rank fields kept", async () => {
        expect(await adapter.importRows(TYPE, [exportRow()])).toEqual({ urls: 1, hits: 1 });
        expect(urlsOf(await adapter.queryExact(TYPE, "rust", 10))).toEqual(["https://import.example/1"]);
        const hit = await exportedFor(adapter, TYPE, "https://import.example/1");
        expect(hit!.engine_type).toBe(TYPE);
        expect(Number(hit!.best_position)).toBe(3);
        expect(Number(hit!.pos_sum)).toBe(12);
        expect(Number(hit!.hit_count)).toBe(4);
        expect(Number(hit!.first_seen)).toBe(100);
        expect(Number(hit!.last_seen)).toBe(200);
        expect(hit!.sources_json).toBe('["Brave"]');
        expect(hit!.filters_json).toBe('{"f":1}');
        expect(hit!.meta_json).toBe('{"m":1}');
      });

      test("defaults missing rank fields", async () => {
        await adapter.importRows(TYPE, [
          exportRow({ best_position: null, pos_sum: null, hit_count: null, sources_json: null }),
        ]);
        const hit = await exportedFor(adapter, TYPE, "https://import.example/1");
        expect(Number(hit!.best_position)).toBe(9999);
        expect(Number(hit!.hit_count)).toBe(1);
        expect(Number(hit!.pos_sum)).toBe(9999);
        expect(hit!.sources_json).toBeNull();
      });

      test("never overwrites what is already there", async () => {
        await write(TYPE, [row(TYPE, { url: "https://import.example/1", title: "Local" })]);
        const res = await adapter.importRows(TYPE, [
          exportRow({ title: "Imported title that is longer" }),
          exportRow({ query_norm: "other" }),
        ]);
        expect(res).toEqual({ urls: 0, hits: 1 });
        expect(await adapter.importRows(TYPE, [exportRow()])).toEqual({ urls: 0, hits: 0 });
        const [local] = await adapter.queryExact(TYPE, "rust", 10);
        expect(local.title).toBe("Local");
      });
    });

    describe("export", () => {
      const seed = async (n: number): Promise<void> => {
        const rows = Array.from({ length: n }, (_, i) =>
          row(TYPE, { url: `https://example.com/${i}`, position: i + 1 }),
        );
        await write(TYPE, rows, 7000);
      };

      test("exportBatches yields every hit in batches of the requested size", async () => {
        await seed(5);
        const batches = await drain(adapter.exportBatches(TYPE, 2));
        expect(batches.map((b) => b.length)).toEqual([2, 2, 1]);
        expect(batches.flat().map((r) => r.url).sort()).toEqual(
          Array.from({ length: 5 }, (_, i) => `https://example.com/${i}`).sort(),
        );
      });

      test("exportBatches on an empty type yields nothing", async () => {
        expect(await drain(adapter.exportBatches(TYPE, 10))).toEqual([]);
      });

      test("export round-trips through importRows", async () => {
        await seed(3);
        const rows = (await drain(adapter.exportBatches(TYPE, 10))).flat();
        expect(await adapter.importRows(OTHER, rows)).toEqual({ urls: 3, hits: 3 });
        expect(await adapter.getTypeCounts(OTHER)).toEqual({ hits: 3, urls: 3, queries: 1 });
        expect(urlsOf(await adapter.queryExact(OTHER, "rust", 10))).toEqual(
          urlsOf(await adapter.queryExact(TYPE, "rust", 10)),
        );
      });

      test("sampleRows returns the newest hits with the export fields", async () => {
        await write(TYPE, [row(TYPE, { url: "https://example.com/old" })], 1000);
        await write(TYPE, [row(TYPE, { url: "https://example.com/new", position: 2 })], 2000);
        const sample = await adapter.sampleRows(TYPE, 1);
        expect(sample.length).toBe(1);
        expect(sample[0]).toMatchObject({
          url: "https://example.com/new",
          url_norm: "example.com/new",
          query_norm: "rust",
          engine_type: TYPE,
          source_instance: null,
          best_position: 2,
          hit_count: 1,
          sources_json: '["TestEngine"]',
        });
        expect(Number(sample[0].pos_sum)).toBe(2);
        expect(Number(sample[0].last_seen)).toBe(2000);
      });
    });

    describe("pruneType", () => {
      test("maxAgeDays drops stale hits and their orphaned urls", async () => {
        const old = Date.now() - 10 * DAY_MS;
        await write(TYPE, [row(TYPE, { url: "https://example.com/old" })], old);
        await write(TYPE, [row(TYPE, { url: "https://example.com/fresh" })]);
        await adapter.pruneType(TYPE, config({ maxAgeDays: 5, pruneEnabled: false }));
        expect(await adapter.getTypeCounts(TYPE)).toEqual({ hits: 1, urls: 1, queries: 1 });
        expect(urlsOf(await adapter.queryExact(TYPE, "rust", 10))).toEqual(["https://example.com/fresh"]);
      });

      test("maxHits keeps the most recently seen hits", async () => {
        for (let i = 0; i < 4; i++) {
          await write(TYPE, [row(TYPE, { url: `https://example.com/${i}` })], 1000 + i);
        }
        await adapter.pruneType(TYPE, config({ maxHits: 2 }));
        expect(await adapter.getTypeCounts(TYPE)).toEqual({ hits: 2, urls: 2, queries: 1 });
        expect(urlsOf(await adapter.queryExact(TYPE, "rust", 10)).sort()).toEqual([
          "https://example.com/2",
          "https://example.com/3",
        ]);
      });

      test("maxUrls keeps the most recently seen urls and their hits", async () => {
        for (let i = 0; i < 4; i++) {
          await write(TYPE, [row(TYPE, { url: `https://example.com/${i}` })], 1000 + i);
        }
        await adapter.pruneType(TYPE, config({ maxUrls: 1 }));
        expect(await adapter.getTypeCounts(TYPE)).toEqual({ hits: 1, urls: 1, queries: 1 });
        expect(urlsOf(await adapter.queryExact(TYPE, "rust", 10))).toEqual(["https://example.com/3"]);
      });

      test("size caps are ignored while pruning is disabled", async () => {
        for (let i = 0; i < 3; i++) {
          await write(TYPE, [row(TYPE, { url: `https://example.com/${i}` })], 1000 + i);
        }
        await adapter.pruneType(TYPE, config({ maxHits: 1, maxUrls: 1, pruneEnabled: false }));
        expect(await adapter.getTypeCounts(TYPE)).toEqual({ hits: 3, urls: 3, queries: 1 });
      });
    });

    describe("clearType and sizing", () => {
      test("clearType wipes the type and leaves it writable", async () => {
        await write(TYPE, [row(TYPE)]);
        await write(OTHER, [row(OTHER)]);
        await adapter.clearType(TYPE);
        expect(await adapter.getTypeCounts(TYPE)).toEqual({ hits: 0, urls: 0, queries: 0 });
        expect((await adapter.getTypeCounts(OTHER)).hits).toBe(1);
        await write(TYPE, [row(TYPE)]);
        expect((await adapter.getTypeCounts(TYPE)).hits).toBe(1);
      });

      test("totalDbSize is positive for stored types and zero for none", async () => {
        await write(TYPE, [row(TYPE)]);
        await adapter.checkpoint(TYPE);
        expect(await adapter.totalDbSize([TYPE])).toBeGreaterThan(0);
        expect(await adapter.totalDbSize([])).toBe(0);
      });
    });
  });
}

for (const c of CASES) adapterContract(c);
