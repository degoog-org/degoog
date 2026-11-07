import { afterAll, beforeAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { closeAllDbs } from "../../src/server/indexer/db/lifecycle";
import { clearIndexerListsCache } from "../../src/server/indexer/config/lists";
import { wipeStatsCache } from "../../src/server/indexer/store/stats";
import { clearServerSettingsCache } from "../../src/server/utils/settings/server-settings";

const ISOLATED = ["DEGOOG_INDEXER_DIR", "DEGOOG_INDEXER_DB", "DEGOOG_SERVER_SETTINGS_FILE"] as const;

const _dropIndexerState = async (): Promise<void> => {
  await closeAllDbs();
  clearIndexerListsCache();
  clearServerSettingsCache();
  wipeStatsCache();
};

export const useIndexerDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const saved: Record<string, string | undefined> = {};
  for (const key of ISOLATED) saved[key] = process.env[key];
  const point = (): void => {
    process.env.DEGOOG_INDEXER_DIR = dir;
    process.env.DEGOOG_INDEXER_DB = join(dir, "index.db");
    process.env.DEGOOG_SERVER_SETTINGS_FILE = join(dir, "server-settings.json");
  };
  point();
  beforeAll(async () => {
    point();
    await _dropIndexerState();
  });
  afterAll(async () => {
    await _dropIndexerState();
    for (const key of ISOLATED) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
};
