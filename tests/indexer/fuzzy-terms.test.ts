import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { mkdirSync } from "fs";
import { Database } from "bun:sqlite";
import { tmpdir } from "os";
import { join } from "path";

const SHARED = join(tmpdir(), "degoog-indexer-tests");
mkdirSync(SHARED, { recursive: true });
process.env.DEGOOG_INDEXER_DIR = SHARED;
process.env.DEGOOG_INDEXER_DB = join(SHARED, "index.db");
process.env.DEGOOG_SERVER_SETTINGS_FILE = join(SHARED, "server-settings.json");

import { buildFtsQuery } from "../../src/server/indexer/adapters/sqlite/fts";
import { FUZZY_SQL } from "../../src/server/indexer/adapters/sqlite/statements";
import { FUZZY_CANDIDATE_CAP, splitTerms, termHit } from "../../src/server/indexer/shared/terms";
import { clearAll } from "../../src/server/indexer/store/admin";
import { queryIndex } from "../../src/server/indexer/store/query";
import { recordResults } from "../../src/server/indexer/store/record";
import { flushQueue } from "../../src/server/indexer/queue/queue";
import { setInstanceSettings } from "../../src/server/utils/settings/server-settings";
import type { SearchResult } from "../../src/shared/search-types";

const TYPE = "web";

const res = (title: string, url: string, snippet = ""): SearchResult => ({
  title,
  url,
  snippet,
  source: "TestEngine",
});

const fuzzySettings = async (): Promise<void> => {
  await setInstanceSettings({
    degoogIndexerEnabled: "true",
    degoogIndexerMaxPerSearch: "30",
    degoogIndexerMaxUrls: "0",
    degoogIndexerMaxHits: "0",
    degoogIndexerPruneEnabled: "true",
    degoogIndexerFuzzyEnabled: "true",
    degoogIndexerQueryLimit: "30",
  });
};

describe("fts term building", () => {
  test("short punctuated queries never become a one-letter prefix", () => {
    expect(buildFtsQuery("c++")).toBe('"c"');
    expect(buildFtsQuery("c#")).toBe('"c"');
    expect(buildFtsQuery("f#")).toBe('"f"');
    expect(buildFtsQuery("a+")).toBe('"a"');
  });

  test("longer terms still prefix match", () => {
    expect(buildFtsQuery("hello!")).toBe('"hello"*');
    expect(buildFtsQuery("rust book")).toBe('"rust"* AND "book"*');
  });

  test("terms are quoted so fts operators cannot leak in", () => {
    expect(buildFtsQuery("foo and bar")).toBe('"foo"* AND "and"* AND "bar"*');
  });

  test("queries with no usable token produce no fts query", () => {
    expect(buildFtsQuery("++")).toBe("");
    expect(buildFtsQuery("--")).toBe("");
    expect(buildFtsQuery("!!! ???")).toBe("");
  });

  test("term matching accepts the raw form and the bare token", () => {
    const [term] = splitTerms("c++");
    expect(termHit("learn c++ today", term)).toBe(true);
    expect(termHit("the c programming language", term)).toBe(true);
    expect(termHit("a page about coffee at github.com", term)).toBe(false);
  });
});

describe("fuzzy recall for punctuated queries", () => {
  beforeAll(async () => {
    await fuzzySettings();
    await clearAll();
  });

  beforeEach(async () => {
    await fuzzySettings();
    await clearAll();
  });

  test("c++ recalls c++ pages and not every .com url", async () => {
    await recordResults("cpp tutorial", TYPE, [
      res("Learn C++ today", "https://example.org/cpp"),
      res("The Rust Book", "https://github.com/rust-lang/book"),
      res("Random blog", "https://myblog.com/post"),
    ]);
    await flushQueue();

    const out = await queryIndex("c++", TYPE);
    const urls = out.map((r) => r.url);
    expect(urls).toContain("https://example.org/cpp");
    expect(urls).not.toContain("https://github.com/rust-lang/book");
    expect(urls).not.toContain("https://myblog.com/post");
  });

  test("a query of pure punctuation returns nothing and touches no index", async () => {
    await recordResults("anything", TYPE, [res("A page", "https://example.com/a")]);
    await flushQueue();

    expect(await queryIndex("+++", TYPE)).toEqual([]);
    expect(await queryIndex("!!!", TYPE)).toEqual([]);
  });

  test("exact hits still win and fuzzy does not duplicate them", async () => {
    await recordResults("c++", TYPE, [res("C++ reference", "https://example.org/ref")]);
    await recordResults("cpp guide", TYPE, [res("C++ guide", "https://example.org/guide")]);
    await flushQueue();

    const out = await queryIndex("c++", TYPE);
    const urls = out.map((r) => r.url);
    expect(urls[0]).toBe("https://example.org/ref");
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("fuzzy results are not eaten by the query_hits join", () => {
  beforeEach(async () => {
    await fuzzySettings();
    await clearAll();
  });

  test("every stored url is returned once, not once per past query", async () => {
    const pages = Array.from({ length: 10 }, (_, i) =>
      res(`guidebook chapter ${i}`, `https://example.org/chapter-${i}`),
    );
    for (let q = 0; q < 5; q++) {
      await recordResults(`guidebook lesson ${q}`, TYPE, pages);
    }
    await flushQueue();

    const out = await queryIndex("guidebook", TYPE);
    const urls = out.map((r) => r.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.length).toBe(10);
  });
});

describe("query_hits join is indexed", () => {
  beforeEach(async () => {
    await fuzzySettings();
    await clearAll();
  });

  test("url_id has an index so the fuzzy join is not a scan", async () => {
    await recordResults("indexcheck", TYPE, [res("A page", "https://example.org/a")]);
    await flushQueue();

    const db = new Database(join(SHARED, `index-${TYPE}.db`), { readonly: true });
    try {
      const plan = db
        .prepare(`EXPLAIN QUERY PLAN ${FUZZY_SQL}`)
        .all(`"page"*`, TYPE, "zzz", FUZZY_CANDIDATE_CAP, 10, 0) as { detail: string }[];
      const joinStep = plan.map((p) => p.detail).join(" | ");
      expect(joinStep).toContain("idx_hits_url_id");
    } finally {
      db.close();
    }
  });
});
