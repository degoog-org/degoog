import { describe, test, expect, beforeAll } from "bun:test";
import { existsSync, mkdirSync, statSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";

const SHARED = join(tmpdir(), "degoog-indexer-tests");
mkdirSync(SHARED, { recursive: true });
process.env.DEGOOG_INDEXER_DIR = SHARED;
process.env.DEGOOG_INDEXER_DB = join(SHARED, "index.db");
process.env.DEGOOG_SERVER_SETTINGS_FILE = join(SHARED, "server-settings.json");

import { Database } from "bun:sqlite";
import { clearAll } from "../../src/server/indexer/store/admin";
import { queryIndex } from "../../src/server/indexer/store/query";
import { recordResults } from "../../src/server/indexer/store/record";
import { getStats, wipeStatsCache } from "../../src/server/indexer/store/stats";
import { flushQueue } from "../../src/server/indexer/queue/queue";
import { setInstanceSettings } from "../../src/server/utils/settings/server-settings";
import { buildSqliteExportFile, exportStream } from "../../src/server/indexer/export/builder";
import { getAdapter } from "../../src/server/indexer/db/factory";
import { indexerDbForType } from "../../src/server/utils/paths";
import { importFromFile } from "../../src/server/indexer/import/importer";
import {
  openExportSession,
  getExportSession,
  closeExportSession,
  openImportSession,
  getImportSession,
  appendImportChunk,
  finishImportSession,
  removeImportSession,
} from "../../src/server/indexer/transfer/sessions";
import type { SearchResult } from "../../src/shared/search-types";

const TYPE = "web";

const mk = (n: number): SearchResult => ({
  title: `Title ${n}`,
  url: `https://example.com/page-${n}`,
  snippet: `snippet ${n}`,
  source: "TestEngine",
});

const seed = async (): Promise<void> => {
  await setInstanceSettings({
    degoogIndexerEnabled: "true",
    degoogIndexerMaxPerSearch: "30",
    degoogIndexerFuzzyEnabled: "false",
    degoogIndexerQueryLimit: "30",
  });
  await clearAll();
  await recordResults("hello", TYPE, [mk(1), mk(2), mk(3)]);
  await flushQueue();
};

const openLive = (): string =>
  openExportSession({
    path: indexerDbForType(TYPE),
    size: 1,
    cleanup: false,
    type: TYPE,
    hold: getAdapter().holdExport(TYPE),
  });

describe("export holds the wal fold-back", () => {
  const walPath = join(SHARED, `index-${TYPE}.db-wal`);
  const walSize = (): number => {
    try {
      return statSync(walPath).size;
    } catch {
      return 0;
    }
  };

  test("writes during an export are not folded into the file being sent", async () => {
    await seed();
    const adapter = getAdapter();

    const sessionId = openLive();
    expect(walSize()).toBe(0);

    await recordResults("holdcheck", TYPE, [mk(50), mk(51)]);
    await flushQueue();
    expect(walSize()).toBeGreaterThan(0);

    await adapter.checkpoint(TYPE);
    expect(walSize()).toBeGreaterThan(0);

    closeExportSession(sessionId);
    expect(walSize()).toBe(0);
  });

  test("overlapping exports keep the hold until the last one ends", async () => {
    await seed();
    const adapter = getAdapter();

    const first = openLive();
    const second = openLive();
    await recordResults("holdcheck2", TYPE, [mk(60)]);
    await flushQueue();
    expect(walSize()).toBeGreaterThan(0);

    closeExportSession(first);
    await adapter.checkpoint(TYPE);
    expect(walSize()).toBeGreaterThan(0);

    closeExportSession(second);
    expect(walSize()).toBe(0);
  });

  test("a hold taken before the db opens still freezes it", async () => {
    await seed();
    const adapter = getAdapter();
    await adapter.checkpoint(TYPE);
    await adapter.close();

    const hold = adapter.holdExport(TYPE);
    await recordResults("lateopen", TYPE, [mk(80)]);
    await flushQueue();
    await adapter.checkpoint(TYPE);
    expect(walSize()).toBeGreaterThan(0);

    adapter.freeExport(hold);
    expect(walSize()).toBe(0);
  });

  test("a stale hold is dropped and does not take a live one with it", async () => {
    await seed();
    const adapter = getAdapter();
    await recordResults("stale", TYPE, [mk(90)]);
    await flushQueue();

    const stale = adapter.holdExport(TYPE);
    const holds = (adapter as unknown as {
      _holds: Map<string, { type: string; since: number }>;
    })._holds;
    const entry = holds.get(stale);
    expect(entry).toBeDefined();
    if (entry) entry.since = Date.now() - 31 * 60_000;

    const live = adapter.holdExport(TYPE);
    expect(holds.has(stale)).toBe(false);

    await recordResults("stale2", TYPE, [mk(91)]);
    await flushQueue();
    expect(walSize()).toBeGreaterThan(0);

    adapter.freeExport(stale);
    await adapter.checkpoint(TYPE);
    expect(walSize()).toBeGreaterThan(0);

    adapter.freeExport(live);
    expect(walSize()).toBe(0);
  });

  test("clearing a type drops its holds", async () => {
    await seed();
    const adapter = getAdapter();
    const hold = adapter.holdExport(TYPE);
    await adapter.clearType(TYPE);

    await recordResults("afterclear", TYPE, [mk(95)]);
    await flushQueue();
    await adapter.checkpoint(TYPE);
    expect(walSize()).toBe(0);

    adapter.freeExport(hold);
  });

  test("a temp file export does not touch the hold", async () => {
    await seed();
    const adapter = getAdapter();
    await recordResults("holdcheck3", TYPE, [mk(70)]);
    await flushQueue();

    const built = await buildSqliteExportFile(TYPE);
    const sessionId = openExportSession({ path: built, size: statSync(built).size, cleanup: true, type: TYPE, hold: "" });
    await adapter.checkpoint(TYPE);
    expect(walSize()).toBe(0);

    closeExportSession(sessionId);
  });
});

const walSizeOf = (type: string): number => {
  try {
    return statSync(join(SHARED, `index-${type}.db-wal`)).size;
  } catch {
    return 0;
  }
};

describe("export stream lifecycle", () => {
  const drain = async (stream: ReadableStream<Uint8Array>): Promise<number> => {
    const reader = stream.getReader();
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return total;
      total += value.byteLength;
    }
  };

  test("onEnd fires once when the body is read to the end", async () => {
    await seed();
    const path = await buildSqliteExportFile(TYPE);
    const size = statSync(path).size;
    let ends = 0;

    const stream = exportStream(path, {
      size,
      removeAfter: false,
      onEnd: () => { ends += 1; },
    });
    expect(await drain(stream)).toBe(size);
    expect(ends).toBe(1);
  });

  test("reading keeps a long download's hold alive", async () => {
    await seed();
    const adapter = getAdapter();
    const hold = adapter.holdExport(TYPE);
    const holds = (adapter as unknown as {
      _holds: Map<string, { type: string; since: number }>;
    })._holds;

    const entry = holds.get(hold);
    if (entry) entry.since = Date.now() - 31 * 60_000;

    const path = await buildSqliteExportFile(TYPE);
    const stream = exportStream(path, {
      size: statSync(path).size,
      removeAfter: true,
      onRead: () => adapter.touchHold(hold),
    });
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel("enough");

    await recordResults("longdownload", TYPE, [mk(99)]);
    await flushQueue();
    await adapter.checkpoint(TYPE);
    expect(holds.has(hold)).toBe(true);
    expect(walSizeOf(TYPE)).toBeGreaterThan(0);

    adapter.freeExport(hold);
  });

  test("onEnd fires once when the reader cancels early", async () => {
    await seed();
    const path = await buildSqliteExportFile(TYPE);
    let ends = 0;

    const stream = exportStream(path, {
      size: statSync(path).size,
      removeAfter: true,
      onEnd: () => { ends += 1; },
    });
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel("done here");
    expect(ends).toBe(1);
    expect(existsSync(path)).toBe(false);
  });
});

describe("export streaming", () => {
  test("rows arrive in batches instead of one huge array", async () => {
    await setInstanceSettings({
      degoogIndexerEnabled: "true",
      degoogIndexerMaxPerSearch: "300",
      degoogIndexerFuzzyEnabled: "false",
      degoogIndexerQueryLimit: "30",
    });
    await clearAll();
    await recordResults(
      "batching",
      TYPE,
      Array.from({ length: 250 }, (_, i) => mk(1000 + i)),
    );
    await flushQueue();

    const sizes: number[] = [];
    for await (const batch of getAdapter().exportBatches(TYPE, 100)) {
      sizes.push(batch.length);
    }

    expect(sizes.length).toBeGreaterThan(1);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(100);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(250);
  });
});

describe("indexer chunked transfer", () => {
  beforeAll(seed);

  test("an export session exposes the file size and is gone once closed", async () => {
    const path = await buildSqliteExportFile(TYPE);
    const size = statSync(path).size;
    const sessionId = openExportSession({ path, size, cleanup: true, type: TYPE, hold: "" });

    expect(getExportSession(sessionId)?.size).toBe(size);

    closeExportSession(sessionId);
    expect(getExportSession(sessionId)).toBeUndefined();
  });

  test("chunked import restores rows into a cleared index", async () => {
    const path = await buildSqliteExportFile(TYPE);
    const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());

    await clearAll();
    expect((await getStats()).totalHits).toBe(0);

    const { id } = openImportSession(TYPE);
    const chunkBytes = 4096;
    for (let pos = 0; pos < bytes.byteLength; pos += chunkBytes) {
      const slice = bytes.slice(pos, Math.min(bytes.byteLength, pos + chunkBytes));
      const received = await appendImportChunk(id, slice.buffer);
      expect(received).toBe(Math.min(bytes.byteLength, pos + chunkBytes));
    }

    const type = getImportSession(id)?.type ?? "";
    const finished = await finishImportSession(id);
    expect(finished).not.toBeNull();

    const result = await importFromFile(finished as string, type);
    removeImportSession(id);

    expect(result.hits).toBe(3);
    wipeStatsCache();
    expect((await getStats()).totalHits).toBe(3);

    const restored = await queryIndex("hello", TYPE);
    expect(restored.length).toBe(3);
  });

  test("import sessions stage chunks in the indexer tmp folder", async () => {
    const { id } = openImportSession(TYPE);
    const s = getImportSession(id);

    expect(dirname(s?.path ?? "")).toBe(join(SHARED, "tmp"));

    removeImportSession(id);
  });

  test("import preserves real ranking instead of flattening to 9999", async () => {
    await clearAll();
    await recordResults("rankcheck", TYPE, [mk(10), mk(11), mk(12)]);
    await flushQueue();

    const path = await buildSqliteExportFile(TYPE);
    const src = new Database(path, { readonly: true });
    const before = (
      src.prepare("SELECT pos_sum FROM query_hits ORDER BY pos_sum ASC").all() as {
        pos_sum: number;
      }[]
    ).map((r) => r.pos_sum);
    src.close();

    await clearAll();
    const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
    const { id } = openImportSession(TYPE);
    await appendImportChunk(id, bytes.buffer);
    const finished = await finishImportSession(id);
    await importFromFile(finished as string, TYPE);
    removeImportSession(id);

    const dst = new Database(join(SHARED, `index-${TYPE}.db`), { readonly: true });
    const after = (
      dst.prepare("SELECT pos_sum FROM query_hits ORDER BY pos_sum ASC").all() as {
        pos_sum: number;
      }[]
    ).map((r) => r.pos_sum);
    dst.close();

    expect(after).toEqual(before);
    expect(after.some((p) => p !== 9999)).toBe(true);
  });

  test("unknown sessions are handled safely", async () => {
    expect(getExportSession("nope")).toBeUndefined();
    expect(getImportSession("nope")).toBeUndefined();
    expect(await appendImportChunk("nope", new ArrayBuffer(4))).toBeNull();
    expect(await finishImportSession("nope")).toBeNull();
  });
});
