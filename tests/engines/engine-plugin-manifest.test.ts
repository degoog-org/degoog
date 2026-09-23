import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { clearServerSettingsCache } from "../../src/server/utils/settings/server-settings";
import { initEngines, listEngineIds } from "../../src/server/extensions/engines/loader";
import {
  getActiveWebEngines,
  getEngineMap,
  getEngineSettingsView,
  getEnginesForCustomType,
} from "../../src/server/extensions/engines/catalog";
import { getEngineExtensionMeta } from "../../src/server/extensions/engines/extension-meta";
import { clearTypeCache } from "../../src/server/extensions/engines/search-types";
import {
  getSettings,
  setSettings,
} from "../../src/server/utils/settings/plugin-settings";
import { syncExtSettings } from "../../src/server/extensions/settings-sync";
import { engineFingerprint } from "../../src/server/search/engine-selection";
import {
  INVALIDATE_SCOPE,
  publishInvalidate,
} from "../../src/server/utils/cache/cache-valkey";

const SHARED_ID = "hister-slot";
const PLAIN_ID = "plain-web-engine";
const PAIRED_ID = "paired-web-engine";

const withEngineEnv = async <T>(
  seedSettings: Record<string, Record<string, string>>,
  fn: () => Promise<T>,
): Promise<T> => {
  const dir = mkdtempSync(join(tmpdir(), "degoog-engine-manifest-"));
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

  mkdirSync(enginesDir, { recursive: true });
  mkdirSync(transportsDir, { recursive: true });
  writeFileSync(
    serverSettingsFile,
    JSON.stringify({ degoogIndexerEnabled: false }),
  );
  writeFileSync(settingsFile, JSON.stringify(seedSettings));

  clearServerSettingsCache();
  clearTypeCache();
  await publishInvalidate(INVALIDATE_SCOPE.PLUGIN_SETTINGS);

  try {
    return await fn();
  } finally {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore("DEGOOG_DATA_DIR", prev.dataDir);
    restore("DEGOOG_ENGINES_DIR", prev.enginesDir);
    restore("DEGOOG_TRANSPORTS_DIR", prev.transportsDir);
    restore("DEGOOG_PLUGIN_SETTINGS_FILE", prev.settingsFile);
    restore("DEGOOG_SERVER_SETTINGS_FILE", prev.serverSettingsFile);
    clearServerSettingsCache();
    clearTypeCache();
    await publishInvalidate(INVALIDATE_SCOPE.PLUGIN_SETTINGS);
    rmSync(dir, { recursive: true, force: true });
  }
};

const writePlainEngine = (enginesDir: string) => {
  mkdirSync(join(enginesDir, "plain-web"), { recursive: true });
  writeFileSync(
    join(enginesDir, "plain-web", "index.js"),
    `
      export const type = "web";
      export default class PlainEngine {
        name = "Plain";
        settingsSchema = [
          { key: "ownField", label: "Own", type: "text", default: "own-default" }
        ];
        lastConfig = null;
        configure(settings) { this.lastConfig = settings; }
        async executeSearch() { return []; }
      }
    `,
  );
};

const writePairedEngine = (enginesDir: string) => {
  mkdirSync(join(enginesDir, "paired-web"), { recursive: true });
  writeFileSync(
    join(enginesDir, "paired-web", "index.js"),
    `
      export const type = "web";
      export const plugin = {
        id: ${JSON.stringify(SHARED_ID)},
        name: "Hister",
        settingsSchema: [
          { key: "baseUrl", label: "Base URL", type: "text", default: "" },
          { key: "apiToken", label: "API token", type: "text", default: "" }
        ],
      };
      export default class PairedEngine {
        name = "Paired";
        settingsSchema = [
          { key: "ownField", label: "Own", type: "text", default: "own-default" }
        ];
        lastConfig = null;
        configure(settings) { this.lastConfig = settings; }
        async executeSearch() { return []; }
      }
    `,
  );
};

const bootEngines = async () => {
  writePlainEngine(process.env.DEGOOG_ENGINES_DIR!);
  writePairedEngine(process.env.DEGOOG_ENGINES_DIR!);
  await initEngines(true);
};

type Configured = { lastConfig: Record<string, unknown> | null };

describe("engines paired with a plugin manifest", () => {
  test("an engine without a manifest keeps its id, bucket and card", async () => {
    await withEngineEnv(
      {
        [PLAIN_ID]: { ownField: "from-engine-bucket", score: "2.5" },
        [SHARED_ID]: { baseUrl: "https://shared.example", ownField: "nope" },
      },
      async () => {
        await bootEngines();
        expect(listEngineIds()).toContain(PLAIN_ID);

        const view = await getEngineSettingsView(PLAIN_ID);
        expect(view).toEqual(await getSettings(PLAIN_ID));
        expect(view.baseUrl).toBeUndefined();

        const instance = getEngineMap()[PLAIN_ID] as unknown as Configured;
        expect(instance.lastConfig?.ownField).toBe("from-engine-bucket");
        expect(instance.lastConfig?.baseUrl).toBeUndefined();

        const meta = await getEngineExtensionMeta();
        const card = meta.find((m) => m.id === PLAIN_ID);
        expect(card).toBeTruthy();
        expect(card!.settingsSchema.map((f) => f.key)).toContain("ownField");
        expect(card!.settings.ownField).toBe("from-engine-bucket");

        const active = await getActiveWebEngines({ [PLAIN_ID]: true });
        expect(active.find((e) => e.id === PLAIN_ID)?.score).toBe(2.5);
      },
    );
  });

  test("manifest fields resolve from the shared bucket", async () => {
    await withEngineEnv(
      {
        [PAIRED_ID]: { ownField: "engine-own" },
        [SHARED_ID]: { baseUrl: "https://shared.example", apiToken: "t0ken" },
      },
      async () => {
        await bootEngines();
        expect(listEngineIds()).toContain(PAIRED_ID);

        const view = await getEngineSettingsView(PAIRED_ID);
        expect(view.ownField).toBe("engine-own");
        expect(view.baseUrl).toBe("https://shared.example");
        expect(view.apiToken).toBe("t0ken");

        const instance = getEngineMap()[
          PAIRED_ID
        ] as unknown as Configured;
        expect(instance.lastConfig?.baseUrl).toBe("https://shared.example");
        expect(instance.lastConfig?.ownField).toBe("engine-own");
      },
    );
  });

  test("disabled and score stay engine owned for a paired engine", async () => {
    await withEngineEnv(
      {
        [PAIRED_ID]: { score: "3" },
        [SHARED_ID]: { score: "9", disabled: "true" },
      },
      async () => {
        await bootEngines();
        const active = await getActiveWebEngines({
          [PAIRED_ID]: true,
        });
        expect(active.find((e) => e.id === PAIRED_ID)?.score).toBe(3);

        const forType = await getEnginesForCustomType("web", {
          [PAIRED_ID]: true,
        });
        expect(forType.some((e) => e.id === PAIRED_ID)).toBe(true);
      },
    );
  });

  test("disabling the engine's own bucket still removes it", async () => {
    await withEngineEnv(
      { [PAIRED_ID]: { disabled: "true" } },
      async () => {
        await bootEngines();
        const forType = await getEnginesForCustomType("web", {
          [PAIRED_ID]: true,
        });
        expect(forType.some((e) => e.id === PAIRED_ID)).toBe(false);
      },
    );
  });

  test("the engine card does not render manifest declared fields", async () => {
    await withEngineEnv(
      { [SHARED_ID]: { baseUrl: "https://shared.example" } },
      async () => {
        await bootEngines();
        const meta = await getEngineExtensionMeta();

        const card = meta.find((m) => m.id === PAIRED_ID);
        expect(card).toBeTruthy();
        const keys = card!.settingsSchema.map((f) => f.key);
        expect(keys).toContain("ownField");
        expect(keys).not.toContain("baseUrl");
        expect(keys).not.toContain("apiToken");
        expect(card!.settings.baseUrl).toBeUndefined();

        expect(meta.some((m) => m.id === SHARED_ID)).toBe(false);
      },
    );
  });

  test("saving the plugin's settings reconfigures the paired engine", async () => {
    await withEngineEnv(
      {
        [PAIRED_ID]: { ownField: "engine-own" },
        [SHARED_ID]: { baseUrl: "https://old.example" },
      },
      async () => {
        await bootEngines();
        const instance = getEngineMap()[
          PAIRED_ID
        ] as unknown as Configured;
        expect(instance.lastConfig?.baseUrl).toBe("https://old.example");

        await setSettings(SHARED_ID, { baseUrl: "https://new.example" });
        await syncExtSettings(SHARED_ID, await getSettings(SHARED_ID));

        expect(instance.lastConfig?.baseUrl).toBe("https://new.example");
        expect(instance.lastConfig?.ownField).toBe("engine-own");
      },
    );
  });

  test("a manifest field change moves the engine cache fingerprint", async () => {
    await withEngineEnv(
      { [SHARED_ID]: { baseUrl: "https://old.example" } },
      async () => {
        await bootEngines();
        const before = await engineFingerprint(PAIRED_ID);
        await setSettings(SHARED_ID, { baseUrl: "https://new.example" });
        const after = await engineFingerprint(PAIRED_ID);

        expect(after).not.toBe(before);

        const plainBefore = await engineFingerprint(PLAIN_ID);
        await setSettings(SHARED_ID, { baseUrl: "https://third.example" });
        expect(await engineFingerprint(PLAIN_ID)).toBe(plainBefore);
      },
    );
  });
});
