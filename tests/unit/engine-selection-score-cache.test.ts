import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { clearServerSettingsCache } from "../../src/server/utils/server-settings";
import { clearTypeCache } from "../../src/server/extensions/engines/registry";

const withTempEngineEnv = async <T>(fn: () => Promise<T>): Promise<T> => {
  const dir = mkdtempSync(join(tmpdir(), "degoog-engine-score-"));
  const enginesDir = join(dir, "engines");
  const settingsFile = join(dir, "plugin-settings.json");
  const serverSettingsFile = join(dir, "server-settings.json");
  const prev = {
    dataDir: process.env.DEGOOG_DATA_DIR,
    enginesDir: process.env.DEGOOG_ENGINES_DIR,
    settingsFile: process.env.DEGOOG_PLUGIN_SETTINGS_FILE,
    serverSettingsFile: process.env.DEGOOG_SERVER_SETTINGS_FILE,
  };

  process.env.DEGOOG_DATA_DIR = dir;
  process.env.DEGOOG_ENGINES_DIR = enginesDir;
  process.env.DEGOOG_PLUGIN_SETTINGS_FILE = settingsFile;
  process.env.DEGOOG_SERVER_SETTINGS_FILE = serverSettingsFile;

  clearServerSettingsCache();
  clearTypeCache();

  mkdirSync(enginesDir, { recursive: true });
  writeFileSync(serverSettingsFile, JSON.stringify({ degoogIndexerEnabled: false }));
  writeFileSync(settingsFile, "{}");

  const engineSource = (name: string) => `
    export const type = "images";
    export default class ${name.replace(/[^A-Za-z0-9]/g, "")}Engine {
      name = ${JSON.stringify(name)};
      async executeSearch() { return []; }
    }
  `;

  mkdirSync(join(enginesDir, "alpha-images"), { recursive: true });
  mkdirSync(join(enginesDir, "beta-images"), { recursive: true });
  writeFileSync(join(enginesDir, "alpha-images", "index.js"), engineSource("Alpha Images"));
  writeFileSync(join(enginesDir, "beta-images", "index.js"), engineSource("Beta Images"));

  try {
    return await fn();
  } finally {
    if (prev.dataDir === undefined) delete process.env.DEGOOG_DATA_DIR;
    else process.env.DEGOOG_DATA_DIR = prev.dataDir;
    if (prev.enginesDir === undefined) delete process.env.DEGOOG_ENGINES_DIR;
    else process.env.DEGOOG_ENGINES_DIR = prev.enginesDir;
    if (prev.settingsFile === undefined) delete process.env.DEGOOG_PLUGIN_SETTINGS_FILE;
    else process.env.DEGOOG_PLUGIN_SETTINGS_FILE = prev.settingsFile;
    if (prev.serverSettingsFile === undefined) delete process.env.DEGOOG_SERVER_SETTINGS_FILE;
    else process.env.DEGOOG_SERVER_SETTINGS_FILE = prev.serverSettingsFile;
    clearServerSettingsCache();
    clearTypeCache();
    rmSync(dir, { recursive: true, force: true });
  }
};

describe("engine scoring outside web search", () => {
  test("selectActiveEngines applies stored scores for image engines", async () => {
    await withTempEngineEnv(async () => {
      const { initEngines, listEngineIds } = await import(
        "../../src/server/extensions/engines/registry"
      );
      const { setSettings } = await import("../../src/server/utils/plugin-settings");
      const { selectActiveEngines } = await import(
        "../../src/server/search/engine-selection"
      );

      await initEngines(true);
      const ids = listEngineIds().filter((id) => id.includes("images"));
      const alpha = ids.find((id) => id.includes("alpha-images"));
      const beta = ids.find((id) => id.includes("beta-images"));
      expect(alpha).toBeTruthy();
      expect(beta).toBeTruthy();

      await setSettings(alpha!, { score: "4" });
      await setSettings(beta!, { score: "2" });

      const active = await selectActiveEngines("images", {
        [alpha!]: true,
        [beta!]: true,
      });

      expect(active.map((e) => [e.id, e.score])).toEqual([
        [alpha!, 4],
        [beta!, 2],
      ]);
    });
  });

  test("engine settings fingerprint changes when an active engine score changes", async () => {
    await withTempEngineEnv(async () => {
      const { initEngines, listEngineIds } = await import(
        "../../src/server/extensions/engines/registry"
      );
      const { setSettings } = await import("../../src/server/utils/plugin-settings");
      const { engineSettingsFingerprint } = await import(
        "../../src/server/search/engine-selection"
      );

      await initEngines(true);
      const alpha = listEngineIds().find((id) => id.includes("alpha-images"));
      expect(alpha).toBeTruthy();

      const config = { [alpha!]: true };
      await setSettings(alpha!, { score: "2" });
      const first = await engineSettingsFingerprint("images", config);

      await setSettings(alpha!, { score: "5" });
      const second = await engineSettingsFingerprint("images", config);

      expect(first).not.toBe(second);
      expect(second).toContain('"score":"5"');
    });
  });
});
