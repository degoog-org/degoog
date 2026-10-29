import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import postgres from "postgres";

const SHARED = mkdtempSync(join(tmpdir(), "degoog-indexer-unicode-tests-"));
process.env.DEGOOG_INDEXER_DIR = SHARED;
process.env.DEGOOG_INDEXER_DB = join(SHARED, "index.db");
process.env.DEGOOG_SERVER_SETTINGS_FILE = join(SHARED, "server-settings.json");

import { buildFtsQuery } from "../../src/server/indexer/adapters/sqlite/fts";
import { SQLITE_SCHEMA_DDL } from "../../src/server/indexer/adapters/sqlite/schema";
import { buildTsQuery } from "../../src/server/indexer/adapters/postgres/tsquery";
import { splitTerms, stripAccents, termHit } from "../../src/server/indexer/shared/terms";
import { clearAll } from "../../src/server/indexer/store/admin";
import { queryIndex } from "../../src/server/indexer/store/query";
import { recordResults } from "../../src/server/indexer/store/record";
import { flushQueue } from "../../src/server/indexer/queue/queue";
import { setInstanceSettings } from "../../src/server/utils/settings/server-settings";
import type { SearchResult } from "../../src/shared/search-types";

const TYPE = "web";
const MANY_TERMS = Array.from({ length: 40 }, (_, i) => `搜索${i}`).join(" ");

const DOCS: Record<string, string> = {
  underscore: "foo_bar configuration guide",
  hebrew: "מזג אוויר תל אביב",
  hindi: "हिन्दी भाषा सीखें",
  tamil: "தமிழ் மொழி கற்க",
  thai: "ภาษาไทย ง่าย",
  cjk: "中文搜索引擎 很好",
  japanese: "東京の天気 予報",
  korean: "한국어 검색 엔진",
  accents: "café crème recipes",
  russian: "погода в москве",
  many: `${MANY_TERMS} 中文`,
};

const CASES: [string, string, boolean][] = [
  ["foo_bar", "underscore", true],
  ["foo_ba", "underscore", true],
  ["מזג", "hebrew", true],
  ["אוויר", "hebrew", true],
  ["हिन्दी", "hindi", true],
  ["தமிழ்", "tamil", true],
  ["ภาษาไทย", "thai", true],
  ["中文", "cjk", true],
  ["東京", "japanese", true],
  ["한국", "korean", true],
  ["погода", "russian", true],
  ["café", "accents", true],
];

const QUERY_PATH_CASES: [string, string, boolean][] = [
  ["搜索", "cjk", true],
  ["天気", "japanese", true],
  ["cafe", "accents", true],
];

const res = (key: string): SearchResult => ({
  title: DOCS[key],
  url: `https://example.org/${key}`,
  snippet: "",
  source: "TestEngine",
});

describe("unicode term building", () => {
  test("underscores split into a phrase instead of collapsing", () => {
    expect(buildFtsQuery("foo_bar")).toBe('"foo bar"*');
    expect(buildTsQuery("foo_bar")).toBe("'foo bar':*");
  });

  test("non-latin words are kept with their combining marks", () => {
    expect(buildFtsQuery("מזג אוויר")).toBe('"מזג"* AND "אוויר"*');
    expect(buildFtsQuery("हिन्दी")).toBe('"हिन्दी"*');
    expect(buildTsQuery("தமிழ்")).toBe("'தமிழ்':*");
  });

  test("short words in unspaced scripts still prefix match", () => {
    expect(buildFtsQuery("中文")).toBe('"中文"*');
    expect(buildFtsQuery("猫")).toBe('"猫"*');
    expect(buildTsQuery("東京")).toBe("'東京':*");
  });

  test("short latin punctuated words still never become a prefix", () => {
    expect(buildFtsQuery("c++")).toBe('"c"');
    expect(buildTsQuery("c++")).toBe("'c'");
  });

  test("quotes and backslashes cannot escape the lexeme", () => {
    expect(buildFtsQuery('say"hi')).toBe('"say hi"*');
    expect(buildTsQuery("it's")).toBe("'it s':*");
    expect(buildTsQuery("a\\b")).toBe("'a b'");
  });

  test("post filter matches folded and unspaced text", () => {
    const [cafe] = splitTerms("café");
    expect(termHit("cafe creme", cafe)).toBe(true);
    const [zh] = splitTerms("中文");
    expect(termHit("中文搜索引擎", zh)).toBe(true);
    const [fb] = splitTerms("foo_bar");
    expect(termHit("foo-bar setup", fb)).toBe(true);
    const [c] = splitTerms("c++");
    expect(termHit("coffee at github.com", c)).toBe(false);
  });
});

describe("accent stripping", () => {
  test("folds latin, greek and cyrillic accents", () => {
    expect(stripAccents("café crème")).toBe("cafe creme");
    expect(stripAccents("ştiinţă")).toBe("stiinta");
    expect(stripAccents("Ελληνικά")).toBe("Ελληνικα");
    expect(stripAccents("ёлка")).toBe("елка");
    expect(stripAccents("cafe\u0301")).toBe("cafe");
  });

  test("leaves marks that change meaning in other scripts alone", () => {
    for (const s of ["ガイド がっこう", "क़लम", "हिन्दी", "தமிழ்", "ภาษาไทย", "한국어", "שָׁלוֹם", "中文"]) {
      expect(stripAccents(s)).toBe(s.normalize("NFC"));
    }
  });

  test("post filter keeps indic words whole", () => {
    const [hi] = splitTerms("हिन्");
    expect(termHit("हिन्दी भाषा", hi)).toBe(true);
    expect(termHit("हनद", hi)).toBe(false);
  });
});

describe("sqlite fuzzy recall across scripts", () => {
  beforeEach(async () => {
    await setInstanceSettings({
      degoogIndexerEnabled: "true",
      degoogIndexerMaxPerSearch: "30",
      degoogIndexerMaxUrls: "0",
      degoogIndexerMaxHits: "0",
      degoogIndexerPruneEnabled: "true",
      degoogIndexerFuzzyEnabled: "true",
      degoogIndexerQueryLimit: "30",
      degoogIndexerFuzzyMinTermRatio: "0.6",
    });
    await clearAll();
    await recordResults("seed", TYPE, Object.keys(DOCS).map(res));
    await flushQueue();
  });

  for (const [query, key, expected] of [...CASES, ...QUERY_PATH_CASES]) {
    test(`${query} ${expected ? "finds" : "does not find"} ${key}`, async () => {
      const urls = (await queryIndex(query, TYPE)).map((r) => r.url);
      expect(urls.includes(`https://example.org/${key}`)).toBe(expected);
    });
  }

  test("a query with many unspaced words still answers", async () => {
    const urls = (await queryIndex(`${MANY_TERMS} 中文`, TYPE)).map((r) => r.url);
    expect(urls).toContain("https://example.org/many");
  });

  test("embedded matches only need as many terms as the ratio asks for", async () => {
    await setInstanceSettings({ degoogIndexerFuzzyMinTermRatio: "0.5" });
    const urls = (await queryIndex("搜索 天気", TYPE)).map((r) => r.url);
    expect(urls).toContain("https://example.org/cjk");
    expect(urls).toContain("https://example.org/japanese");
  });

  test("the fts table is untouched, no reindex needed", () => {
    const fts = SQLITE_SCHEMA_DDL.find((ddl) => ddl.includes("USING fts5"));
    expect(fts).toBeDefined();
    expect(fts).not.toContain("tokenize");
  });
});

const PG_URL = process.env.DEGOOG_TEST_POSTGRES;

describe.skipIf(!PG_URL)("postgres fuzzy recall across scripts", () => {
  const sql = PG_URL ? postgres(PG_URL, { max: 1, onnotice: () => {} }) : null;

  afterAll(async () => {
    await sql?.end();
  });

  for (const [query, key, expected] of CASES) {
    test(`${query} ${expected ? "finds" : "does not find"} ${key}`, async () => {
      const [row] = await sql!<{ hit: boolean }[]>`
        SELECT to_tsvector('simple', ${DOCS[key]}) @@ to_tsquery('simple', ${buildTsQuery(query)}) AS hit
      `;
      const [term] = splitTerms(query);
      expect(row.hit && termHit(DOCS[key].toLowerCase(), term)).toBe(expected);
    });
  }
});
