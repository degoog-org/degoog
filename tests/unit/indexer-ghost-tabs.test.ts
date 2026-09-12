import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { clearServerSettingsCache } from "../../src/server/utils/server-settings";
import { clearTypeCache } from "../../src/server/extensions/engines/registry";

const withTempEngineEnv = async <T>(fn: (dir: string) => Promise<T>): Promise<T> => {
  const dir = mkdtempSync(join(tmpdir(), "degoog-ghost-tabs-"));
  const enginesDir = join(dir, "engines");
  const settingsFile = join(dir, "plugin-settings.json");
  const serverSettingsFile = join(dir, "server-settings.json");
  const indexerDir = join(dir, "indexer");
  const prev = {
    dataDir: process.env.DEGOOG_DATA_DIR,
    enginesDir: process.env.DEGOOG_ENGINES_DIR,
    settingsFile: process.env.DEGOOG_PLUGIN_SETTINGS_FILE,
    serverSettingsFile: process.env.DEGOOG_SERVER_SETTINGS_FILE,
    indexerDir: process.env.DEGOOG_INDEXER_DIR,
  };

  process.env.DEGOOG_DATA_DIR = dir;
  process.env.DEGOOG_ENGINES_DIR = enginesDir;
  process.env.DEGOOG_PLUGIN_SETTINGS_FILE = settingsFile;
  process.env.DEGOOG_SERVER_SETTINGS_FILE = serverSettingsFile;
  process.env.DEGOOG_INDEXER_DIR = indexerDir;

  clearServerSettingsCache();
  clearTypeCache();

  mkdirSync(enginesDir, { recursive: true });
  mkdirSync(indexerDir, { recursive: true });
  writeFileSync(
    serverSettingsFile,
    JSON.stringify({ settings: { degoogIndexerEnabled: true } }),
  );
  writeFileSync(settingsFile, "{}");

  try {
    return await fn(indexerDir);
  } finally {
    const { initEngines } = await import(
      "../../src/server/extensions/engines/registry"
    );
    if (prev.dataDir === undefined) delete process.env.DEGOOG_DATA_DIR;
    else process.env.DEGOOG_DATA_DIR = prev.dataDir;
    if (prev.enginesDir === undefined) delete process.env.DEGOOG_ENGINES_DIR;
    else process.env.DEGOOG_ENGINES_DIR = prev.enginesDir;
    if (prev.settingsFile === undefined) delete process.env.DEGOOG_PLUGIN_SETTINGS_FILE;
    else process.env.DEGOOG_PLUGIN_SETTINGS_FILE = prev.settingsFile;
    if (prev.serverSettingsFile === undefined) delete process.env.DEGOOG_SERVER_SETTINGS_FILE;
    else process.env.DEGOOG_SERVER_SETTINGS_FILE = prev.serverSettingsFile;
    if (prev.indexerDir === undefined) delete process.env.DEGOOG_INDEXER_DIR;
    else process.env.DEGOOG_INDEXER_DIR = prev.indexerDir;
    clearServerSettingsCache();
    clearTypeCache();
    await initEngines(true);
    rmSync(dir, { recursive: true, force: true });
  }
};

const writeEngine = (enginesDir: string, folder: string, engineType: string): void => {
  const dirPath = join(enginesDir, folder);
  mkdirSync(dirPath, { recursive: true });
  writeFileSync(
    join(dirPath, "index.js"),
    `
    export const type = ${JSON.stringify(engineType)};
    export default class ${folder.replace(/[^A-Za-z0-9]/g, "")}Engine {
      name = ${JSON.stringify(folder)};
      async executeSearch() { return []; }
    }
    `,
  );
};

describe("degoog indexer engine type()", () => {
  test("a stale indexer type with no matching engine produces no tab", async () => {
    await withTempEngineEnv(async (indexerDir) => {
      writeFileSync(join(indexerDir, "index-consumer.db"), "");

      const { initEngines } = await import(
        "../../src/server/extensions/engines/registry"
      );
      const { type } = await import(
        "../../src/server/extensions/engines/builtins/degoog/index"
      );

      await initEngines(true);
      expect(await type()).toEqual([]);
    });
  });

  test("a lowercased slug of an installed mixed-case type does not duplicate it", async () => {
    await withTempEngineEnv(async (indexerDir) => {
      writeFileSync(join(indexerDir, "index-privacy.db"), "");

      const { initEngines } = await import(
        "../../src/server/extensions/engines/registry"
      );

      writeEngine(process.env.DEGOOG_ENGINES_DIR!, "tosdr", "Privacy");

      await initEngines(true);
      const { type } = await import(
        "../../src/server/extensions/engines/builtins/degoog/index"
      );

      expect(await type()).toEqual(["Privacy"]);
    });
  });
});

describe("getInstalledSearchTypes", () => {
  test("skips disabled engines", async () => {
    await withTempEngineEnv(async () => {
      writeEngine(process.env.DEGOOG_ENGINES_DIR!, "tosdr", "Privacy");

      const { initEngines, getInstalledSearchTypes } = await import(
        "../../src/server/extensions/engines/registry"
      );
      const { setSettings } = await import(
        "../../src/server/utils/plugin-settings"
      );

      await initEngines(true);
      const before = await getInstalledSearchTypes();
      expect(before).toContain("Privacy");

      await setSettings("tosdr-engine", { disabled: "true" });
      clearTypeCache();
      const after = await getInstalledSearchTypes();
      expect(after).not.toContain("Privacy");
    });
  });
});
