import { describe, test, expect } from "bun:test";
import { parseSqlDump } from "../../src/server/indexer/import/sql-parser";

const PG_COPY_DUMP = `
COPY public.urls (id, url_norm, url, source_engine, title, snippet, thumbnail, image_url, is_gif, duration, extras_json, first_seen, last_seen) FROM stdin;
1\texample.com/a\thttps://example.com/a\tbrave\tTitle A\tSnippet A\t\\N\t\\N\t\\N\t\\N\t\\N\t1000\t2000
2\texample.com/b\thttps://example.com/b\tbrave\tTitle B\tSnip, with comma\t\\N\t\\N\t\\N\t\\N\t\\N\t1500\t2500
\\.
COPY public.query_hits (id, query_norm, engine_type, url_id, best_position, pos_sum, hit_count, first_seen, last_seen) FROM stdin;
1\thello world\tweb\t1\t1\t1\t1\t1000\t2000
2\thello world\tweb\t2\t2\t2\t1\t1500\t2500
\\.
`;

const PG_INSERT_DUMP = `
INSERT INTO urls (id, url_norm, url, source_engine, title, snippet, thumbnail, image_url, is_gif, duration, extras_json, first_seen, last_seen) VALUES
  (1, 'example.com/a', 'https://example.com/a', 'brave', 'It''s A', 'has (parens)', NULL, NULL, NULL, NULL, NULL, 1000, 2000);
INSERT INTO query_hits (id, query_norm, engine_type, url_id, best_position, pos_sum, hit_count, first_seen, last_seen) VALUES
  (1, 'hi', 'web', 1, 1, 1, 1, 1000, 2000);
`;

const SQLITE_DUMP = `
CREATE TABLE urls (id INTEGER PRIMARY KEY, url_norm TEXT, url TEXT, source_engine TEXT, title TEXT, snippet TEXT, thumbnail TEXT, image_url TEXT, is_gif INTEGER, duration TEXT, extras_json TEXT, first_seen INTEGER, last_seen INTEGER);
CREATE TABLE query_hits (id INTEGER PRIMARY KEY, query_norm TEXT, engine_type TEXT, url_id INTEGER, best_position INTEGER, pos_sum INTEGER, hit_count INTEGER, first_seen INTEGER, last_seen INTEGER);
INSERT INTO urls VALUES(1,'example.com/a','https://example.com/a','brave','Title A','Snip A',NULL,NULL,NULL,NULL,NULL,1000,2000);
INSERT INTO query_hits VALUES(1,'q','web',1,1,1,1,1000,2000);
`;

describe("parseSqlDump", () => {
  test("parses postgres COPY dump and joins hits to urls", () => {
    const rows = parseSqlDump(PG_COPY_DUMP);
    expect(rows.length).toBe(2);
    const a = rows.find((r) => r.url_norm === "example.com/a");
    expect(a?.url).toBe("https://example.com/a");
    expect(a?.query_norm).toBe("hello world");
    expect(a?.engine_type).toBe("web");
    expect(a?.title).toBe("Title A");
    expect(a?.thumbnail).toBeNull();
    expect(a?.first_seen).toBe(1000);
    const b = rows.find((r) => r.url_norm === "example.com/b");
    expect(b?.snippet).toBe("Snip, with comma");
  });

  test("parses INSERT dump with quotes and parens", () => {
    const rows = parseSqlDump(PG_INSERT_DUMP);
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe("It's A");
    expect(rows[0].snippet).toBe("has (parens)");
    expect(rows[0].url_norm).toBe("example.com/a");
  });

  test("parses positional sqlite dump using CREATE TABLE columns", () => {
    const rows = parseSqlDump(SQLITE_DUMP);
    expect(rows.length).toBe(1);
    expect(rows[0].url).toBe("https://example.com/a");
    expect(rows[0].query_norm).toBe("q");
  });

  test("returns empty for unrelated sql", () => {
    expect(parseSqlDump("SELECT 1;").length).toBe(0);
    expect(parseSqlDump("not sql at all").length).toBe(0);
  });

  test("skips hits with no matching url", () => {
    const dump = `INSERT INTO query_hits (id, query_norm, engine_type, url_id, first_seen, last_seen) VALUES (1, 'q', 'web', 999, 1, 2);`;
    expect(parseSqlDump(dump).length).toBe(0);
  });
});
