import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { clearServerSettingsCache } from "../../src/server/utils/settings/server-settings";
import { initEngines, listEngineIds } from "../../src/server/extensions/engines/loader";
import { clearTypeCache } from "../../src/server/extensions/engines/search-types";
import { ENGINE_TIMEOUT_MS } from "../../src/server/extensions/engines/setting-fields";
import { initTransports } from "../../src/server/extensions/transports/registry";
import { setSettings } from "../../src/server/utils/settings/plugin-settings";
import {
  ENGINE_TIMEOUT_BUFFER_MS,
  ENGINE_TIMEOUT_MAX_MS,
  ENGINE_TIMEOUT_MIN_MS,
  getEngineTimeout,
} from "../../src/server/search";

const withTempTimeoutEnv = async <T>(fn: () => Promise<T>): Promise<T> => {
  const dir = mkdtempSync(join(tmpdir(), "degoog-engine-timeout-"));
  const enginesDir = join(dir, "engines");
  const transportsDir = join(dir, "transports");
  const settingsFile = join(dir, "plugin-settings.json");
  const serverSettingsFile = join(dir, "server-settings.json");
  const prev = {
    dataDir: process.env.DEGOOG_DATA_DIR,
    enginesDir: process.env.DEGOOG_ENGINES_DIR,
    transportsDir: process.env.DEGOOG_TRANSPORTS_DIR,
    settingsFile: process.env.DEGOOG_PLUGIN_SETTINGS_FILE,
    serverSettingsFile: process.env.DEGOOG_SERVER_SETTINGS_FILE,
  };

  process.env.DEGOOG_DATA_DIR = dir;
  process.env.DEGOOG_ENGINES_DIR = enginesDir;
  process.env.DEGOOG_TRANSPORTS_DIR = transportsDir;
  process.env.DEGOOG_PLUGIN_SETTINGS_FILE = settingsFile;
  process.env.DEGOOG_SERVER_SETTINGS_FILE = serverSettingsFile;

  clearServerSettingsCache();
  clearTypeCache();

  mkdirSync(enginesDir, { recursive: true });
  mkdirSync(transportsDir, { recursive: true });
  writeFileSync(serverSettingsFile, JSON.stringify({ degoogIndexerEnabled: false }));
  writeFileSync(settingsFile, "{}");

  try {
    return await fn();
  } finally {
    if (prev.dataDir === undefined) delete process.env.DEGOOG_DATA_DIR;
    else process.env.DEGOOG_DATA_DIR = prev.dataDir;
    if (prev.enginesDir === undefined) delete process.env.DEGOOG_ENGINES_DIR;
    else process.env.DEGOOG_ENGINES_DIR = prev.enginesDir;
    if (prev.transportsDir === undefined) delete process.env.DEGOOG_TRANSPORTS_DIR;
    else process.env.DEGOOG_TRANSPORTS_DIR = prev.transportsDir;
    if (prev.settingsFile === undefined) delete process.env.DEGOOG_PLUGIN_SETTINGS_FILE;
    else process.env.DEGOOG_PLUGIN_SETTINGS_FILE = prev.settingsFile;
    if (prev.serverSettingsFile === undefined) delete process.env.DEGOOG_SERVER_SETTINGS_FILE;
    else process.env.DEGOOG_SERVER_SETTINGS_FILE = prev.serverSettingsFile;
    clearServerSettingsCache();
    clearTypeCache();
    rmSync(dir, { recursive: true, force: true });
  }
};

const writeEngine = (
  enginesDir: string,
  folder: string,
  className: string,
  extraSchema = "",
) => {
  mkdirSync(join(enginesDir, folder), { recursive: true });
  writeFileSync(
    join(enginesDir, folder, "index.js"),
    `
      export const type = "web";
      export default class ${className}Engine {
        name = ${JSON.stringify(className)};
        settingsSchema = [${extraSchema}];
        async executeSearch() { return []; }
      }
    `,
  );
};

const writeTransport = (
  transportsDir: string,
  folder: string,
  className: string,
  timeoutMs: number,
) => {
  mkdirSync(join(transportsDir, folder), { recursive: true });
  writeFileSync(
    join(transportsDir, folder, "index.js"),
    `
      export default class ${className}Transport {
        name = ${JSON.stringify(folder)};
        timeoutMs = ${timeoutMs};
        available() { return true; }
        async fetch() { return new Response("ok"); }
      }
    `,
  );
};

describe("getEngineTimeout", () => {
  test("returns ENGINE_TIMEOUT_MS when engineSettingsId is undefined", async () => {
    expect(await getEngineTimeout(undefined)).toBe(ENGINE_TIMEOUT_MS);
  });

  test("uses a valid positive stored timeout override", async () => {
    await withTempTimeoutEnv(async () => {
      writeEngine(process.env.DEGOOG_ENGINES_DIR!, "alpha-web", "Alpha");
      await initEngines(true);
      const id = listEngineIds().find((i) => i.includes("alpha-web"));
      expect(id).toBeTruthy();

      await setSettings(id!, { timeoutMs: "3000" });

      expect(await getEngineTimeout(id!)).toBe(3000);
    });
  });

  test("falls back to ENGINE_TIMEOUT_MS for an invalid or absent stored timeout", async () => {
    await withTempTimeoutEnv(async () => {
      writeEngine(process.env.DEGOOG_ENGINES_DIR!, "beta-web", "Beta");
      await initEngines(true);
      const id = listEngineIds().find((i) => i.includes("beta-web"));
      expect(id).toBeTruthy();

      await setSettings(id!, { timeoutMs: "not-a-number" });
      expect(await getEngineTimeout(id!)).toBe(ENGINE_TIMEOUT_MS);

      await setSettings(id!, { timeoutMs: "-1" });
      expect(await getEngineTimeout(id!)).toBe(ENGINE_TIMEOUT_MS);

      expect(await getEngineTimeout("nonexistent-engine-id")).toBe(
        ENGINE_TIMEOUT_MS,
      );
    });
  });

  test("adds the buffer when the resolved transport timeout exceeds the base", async () => {
    await withTempTimeoutEnv(async () => {
      writeTransport(
        process.env.DEGOOG_TRANSPORTS_DIR!,
        "slow-transport",
        "Slow",
        20000,
      );
      await initTransports(true);

      writeEngine(
        process.env.DEGOOG_ENGINES_DIR!,
        "gamma-web",
        "Gamma",
        `{ key: "outgoingTransport", label: "Transport", type: "text", default: "slow-transport" }`,
      );
      await initEngines(true);
      const id = listEngineIds().find((i) => i.includes("gamma-web"));
      expect(id).toBeTruthy();

      await setSettings(id!, { timeoutMs: "3000" });

      expect(await getEngineTimeout(id!)).toBe(20000 + ENGINE_TIMEOUT_BUFFER_MS);
    });
  });

  test("clamps a stored timeout into the min/max range", async () => {
    await withTempTimeoutEnv(async () => {
      writeEngine(process.env.DEGOOG_ENGINES_DIR!, "delta-web", "Delta");
      await initEngines(true);
      const id = listEngineIds().find((i) => i.includes("delta-web"));
      expect(id).toBeTruthy();

      await setSettings(id!, { timeoutMs: String(ENGINE_TIMEOUT_MAX_MS * 10) });
      expect(await getEngineTimeout(id!)).toBe(ENGINE_TIMEOUT_MAX_MS);

      await setSettings(id!, { timeoutMs: "1" });
      expect(await getEngineTimeout(id!)).toBe(ENGINE_TIMEOUT_MIN_MS);
    });
  });
});
