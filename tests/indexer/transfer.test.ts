import { describe, test, expect, beforeAll } from "bun:test";
import { mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const SHARED = join(tmpdir(), "degoog-indexer-tests");
mkdirSync(SHARED, { recursive: true });
process.env.DEGOOG_INDEXER_DIR = SHARED;
process.env.DEGOOG_INDEXER_DB = join(SHARED, "index.db");
process.env.DEGOOG_SERVER_SETTINGS_FILE = join(SHARED, "server-settings.json");

import { Database } from "bun:sqlite";
import {
  clearAll,
  getStats,
  queryIndex,
  recordResults,
  wipeStatsCache,
} from "../../src/server/indexer/store";
import { flushQueue } from "../../src/server/indexer/queue";
import { setInstanceSettings } from "../../src/server/utils/server-settings";
import { buildSqliteExportFile } from "../../src/server/indexer/export/builder";
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
import type { SearchResult } from "../../src/server/types";
import { statSync } from "fs";
import { dirname } from "path";

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

describe("indexer chunked transfer", () => {
  beforeAll(seed);

  test("export session slices reassemble to the full file", async () => {
    const path = await buildSqliteExportFile(TYPE);
    const size = statSync(path).size;
    const sessionId = openExportSession(path, size, true, TYPE);

    const s = getExportSession(sessionId);
    expect(s?.size).toBe(size);

    const chunkBytes = 4096;
    const parts: Uint8Array[] = [];
    for (let pos = 0; pos < size; pos += chunkBytes) {
      const end = Math.min(size, pos + chunkBytes);
      const slice = await Bun.file(path).slice(pos, end).arrayBuffer();
      parts.push(new Uint8Array(slice));
    }
    const total = parts.reduce((sum, p) => sum + p.byteLength, 0);
    expect(total).toBe(size);

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

    expect(s?.path.startsWith(join(SHARED, "tmp"))).toBe(true);
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
