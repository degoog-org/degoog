import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { mkdirSync } from "fs";
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
    const stats = getStats();
    expect(stats.totalHits).toBe(1);
    expect(stats.totalUrls).toBe(1);
  });

  test("deleteHits removes the hit and orphaned url", async () => {
    await recordResults("solo", TYPE, [mk(1)]);
    await flushQueue();
    const rows = listHits({ limit: 10, offset: 0 });
    expect(rows.length).toBe(1);
    const deleted = await deleteHits([{ id: rows[0].id, engine_type: rows[0].engine_type }]);
    expect(deleted).toBe(1);
    const stats = getStats();
    expect(stats.totalHits).toBe(0);
    expect(stats.totalUrls).toBe(0);
  });

  test("listHits/countHits support search and pagination", async () => {
    await recordResults("alpha query", TYPE, [mk(1, "alpha.com")]);
    await recordResults("beta query", TYPE, [mk(2, "beta.com")]);
    await recordResults("gamma other", TYPE, [mk(3, "gamma.com")]);
    await flushQueue();

    expect(countHits()).toBe(3);
    expect(countHits("query")).toBe(2);
    expect(countHits("alpha.com")).toBe(1);

    const firstPage = listHits({ limit: 2, offset: 0 });
    const secondPage = listHits({ limit: 2, offset: 2 });
    expect(firstPage.length).toBe(2);
    expect(secondPage.length).toBe(1);
  });
});
