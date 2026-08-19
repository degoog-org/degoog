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

  test("engine fingerprint changes when that engine's score changes", async () => {
    await withTempEngineEnv(async () => {
      const { initEngines, listEngineIds } = await import(
        "../../src/server/extensions/engines/registry"
      );
      const { setSettings } = await import("../../src/server/utils/plugin-settings");
      const { engineFingerprint } = await import(
        "../../src/server/search/engine-selection"
      );

      await initEngines(true);
      const alpha = listEngineIds().find((id) => id.includes("alpha-images"));
      expect(alpha).toBeTruthy();

      await setSettings(alpha!, { score: "2" });
      const first = await engineFingerprint(alpha!);

      await setSettings(alpha!, { score: "5" });
      const second = await engineFingerprint(alpha!);

      expect(first).not.toBe(second);
      expect(second).toContain('"score":"5"');
    });
  });

  test("engine fingerprint ignores other engines' settings", async () => {
    await withTempEngineEnv(async () => {
      const { initEngines, listEngineIds } = await import(
        "../../src/server/extensions/engines/registry"
      );
      const { setSettings } = await import("../../src/server/utils/plugin-settings");
      const { engineFingerprint } = await import(
        "../../src/server/search/engine-selection"
      );

      await initEngines(true);
      const ids = listEngineIds().filter((id) => id.includes("images"));
      const alpha = ids.find((id) => id.includes("alpha-images"));
      const beta = ids.find((id) => id.includes("beta-images"));

      await setSettings(alpha!, { score: "2" });
      const before = await engineFingerprint(alpha!);

      await setSettings(beta!, { score: "9" });
      const after = await engineFingerprint(alpha!);

      expect(after).toBe(before);
    });
  });
});

describe("per engine cache keys", () => {
  const scope = {
    query: "cats",
    type: "images" as const,
    page: 1,
    timeFilter: "any" as const,
  };

  test("a key belongs to a single engine", async () => {
    await withTempEngineEnv(async () => {
      const { initEngines, listEngineIds } = await import(
        "../../src/server/extensions/engines/registry"
      );
      const { runKey } = await import("../../src/server/search/engine-cache");

      await initEngines(true);
      const ids = listEngineIds().filter((id) => id.includes("images"));
      const alpha = ids.find((id) => id.includes("alpha-images"));
      const beta = ids.find((id) => id.includes("beta-images"));

      expect(await runKey(alpha!, scope)).not.toBe(await runKey(beta!, scope));
      expect(await runKey(alpha!, scope)).toStartWith(`${alpha}|cats|images|1|any`);
    });
  });

  test("an engine key survives another engine's settings change", async () => {
    await withTempEngineEnv(async () => {
      const { initEngines, listEngineIds } = await import(
        "../../src/server/extensions/engines/registry"
      );
      const { setSettings } = await import("../../src/server/utils/plugin-settings");
      const { runKey } = await import("../../src/server/search/engine-cache");

      await initEngines(true);
      const ids = listEngineIds().filter((id) => id.includes("images"));
      const alpha = ids.find((id) => id.includes("alpha-images"));
      const beta = ids.find((id) => id.includes("beta-images"));

      const before = await runKey(alpha!, scope);
      await setSettings(beta!, { score: "9", timeoutMs: "30000" });
      expect(await runKey(alpha!, scope)).toBe(before);
    });
  });

  test("differs when only imgNsfw differs", async () => {
    await withTempEngineEnv(async () => {
      const { initEngines, listEngineIds } = await import(
        "../../src/server/extensions/engines/registry"
      );
      const { runKey } = await import("../../src/server/search/engine-cache");
      const { ImgNsfw } = await import("../../src/server/types");

      await initEngines(true);
      const alpha = listEngineIds().find((id) => id.includes("alpha-images"));

      const safe = await runKey(alpha!, {
        ...scope,
        imageFilter: { nsfw: ImgNsfw.OFF },
      });
      const nsfw = await runKey(alpha!, {
        ...scope,
        imageFilter: { nsfw: ImgNsfw.ON },
      });
      expect(safe).not.toBe(nsfw);
    });
  });

  test("stays stable when imageFilter is absent", async () => {
    await withTempEngineEnv(async () => {
      const { initEngines, listEngineIds } = await import(
        "../../src/server/extensions/engines/registry"
      );
      const { runKey } = await import("../../src/server/search/engine-cache");

      await initEngines(true);
      const alpha = listEngineIds().find((id) => id.includes("alpha-images"));

      expect(await runKey(alpha!, scope)).toBe(await runKey(alpha!, scope));
    });
  });
});

describe("per engine cache policy", () => {
  test("a healthy run keeps the long ttl, a failed one backs off", async () => {
    const { runTtl } = await import("../../src/server/search/engine-cache");
    const { SHORT_TTL_MS, TTL_MS } = await import("../../src/server/utils/cache");

    const timing = (status?: string) => ({
      name: "e",
      time: 1,
      resultCount: 0,
      status,
    });

    expect(runTtl(timing("ok"))).toBe(TTL_MS);
    expect(runTtl(timing(undefined))).toBe(TTL_MS);
    expect(runTtl(timing("timeout"))).toBe(SHORT_TTL_MS);
    expect(runTtl(timing("blocked"))).toBe(SHORT_TTL_MS);
  });

  test("the local index engine is never cached", async () => {
    const { isCacheable } = await import("../../src/server/search/engine-cache");
    const { DEGOOG_ENGINE_NAME } = await import("../../src/shared/search-types");

    expect(isCacheable(DEGOOG_ENGINE_NAME)).toBe(false);
    expect(isCacheable("Alpha Images")).toBe(true);
  });
});
