import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const SHARED = mkdtempSync(join(tmpdir(), "degoog-indexer-tests-"));
process.env.DEGOOG_INDEXER_DIR = SHARED;
process.env.DEGOOG_INDEXER_DB = join(SHARED, "index.db");
process.env.DEGOOG_SERVER_SETTINGS_FILE = join(SHARED, "server-settings.json");

import {
  clearTypeCache,
  initEngines,
  getActiveWebEngines,
} from "../../src/server/extensions/engines/registry";
import { setInstanceSettings } from "../../src/server/utils/server-settings";

const DEGOOG = "degoog-engine";
const hasDegoog = (list: { id: string }[]): boolean =>
  list.some((e) => e.id === DEGOOG);

let enginesRestore: string | undefined;

describe("indexer engine selection", () => {
  beforeAll(async () => {
    enginesRestore = process.env.DEGOOG_ENGINES_DIR;
    process.env.DEGOOG_ENGINES_DIR = "/nonexistent-dir-for-indexer-tests";
    await initEngines(true);
  });

  afterAll(() => {
    if (enginesRestore !== undefined) process.env.DEGOOG_ENGINES_DIR = enginesRestore;
    else delete process.env.DEGOOG_ENGINES_DIR;
    rmSync(SHARED, { recursive: true, force: true });
  });

  test("does not surface degoog engine when indexer has no installed or known web type", async () => {
    await setInstanceSettings({ degoogIndexerEnabled: "true" });
    clearTypeCache();
    const active = await getActiveWebEngines({});
    expect(hasDegoog(active)).toBe(false);
  });

  test("auto-enables degoog engine for known web index type when no explicit config", async () => {
    const marker = join(SHARED, "index-web.db");
    try {
      writeFileSync(marker, "");
      await setInstanceSettings({ degoogIndexerEnabled: "true" });
      clearTypeCache();
      const active = await getActiveWebEngines({});
      expect(hasDegoog(active)).toBe(true);
    } finally {
      rmSync(marker, { force: true });
    }
  });

  test("respects an explicit user disable of the degoog engine", async () => {
    await setInstanceSettings({ degoogIndexerEnabled: "true" });
    clearTypeCache();
    const active = await getActiveWebEngines({ [DEGOOG]: false });
    expect(hasDegoog(active)).toBe(false);
  });

  test("does not surface degoog engine when indexer is off", async () => {
    await setInstanceSettings({ degoogIndexerEnabled: "false" });
    clearTypeCache();
    const active = await getActiveWebEngines({});
    expect(hasDegoog(active)).toBe(false);
  });
});
