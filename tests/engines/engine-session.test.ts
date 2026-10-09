import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  clearServerSettingsCache,
  updateInstanceSettings,
} from "../../src/server/utils/settings/server-settings";
import { initEngines, listEngineIds } from "../../src/server/extensions/engines/loader";
import { clearTypeCache } from "../../src/server/extensions/engines/search-types";
import {
  initTransports,
  transportPicks,
} from "../../src/server/extensions/transports/registry";
import { setSettings } from "../../src/server/utils/settings/plugin-settings";
import {
  createSearchEngineContext,
  endRunSession,
} from "../../src/server/search/engine-context";

type SpyLog = {
  fetches: { url: string; sessionKey?: string; proxyUrl?: string }[];
  ended: string[];
};

const ENV_KEYS = [
  "DEGOOG_DATA_DIR",
  "DEGOOG_ENGINES_DIR",
  "DEGOOG_TRANSPORTS_DIR",
  "DEGOOG_PLUGIN_SETTINGS_FILE",
  "DEGOOG_SERVER_SETTINGS_FILE",
] as const;

const PROXIES = "http://127.0.0.1:1\nhttp://127.0.0.1:2\nhttp://127.0.0.1:3";

const spyLog = (): SpyLog =>
  (globalThis as unknown as { __sessionSpy: SpyLog }).__sessionSpy;

const withSessionEnv = async (fn: (engineId: string) => Promise<void>) => {
  const dir = mkdtempSync(join(tmpdir(), "degoog-engine-session-"));
  const prev = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  const enginesDir = join(dir, "engines");
  const transportsDir = join(dir, "transports");

  process.env.DEGOOG_DATA_DIR = dir;
  process.env.DEGOOG_ENGINES_DIR = enginesDir;
  process.env.DEGOOG_TRANSPORTS_DIR = transportsDir;
  process.env.DEGOOG_PLUGIN_SETTINGS_FILE = join(dir, "plugin-settings.json");
  process.env.DEGOOG_SERVER_SETTINGS_FILE = join(dir, "server-settings.json");
  clearServerSettingsCache();
  clearTypeCache();

  mkdirSync(join(enginesDir, "session-web"), { recursive: true });
  mkdirSync(join(transportsDir, "session-spy"), { recursive: true });
  writeFileSync(
    process.env.DEGOOG_SERVER_SETTINGS_FILE,
    JSON.stringify({ degoogIndexerEnabled: false }),
  );
  writeFileSync(process.env.DEGOOG_PLUGIN_SETTINGS_FILE, "{}");
  writeFileSync(
    join(enginesDir, "session-web", "index.js"),
    `
      export const type = "web";
      export default class SessionEngine {
        name = "Session";
        async executeSearch() { return []; }
      }
    `,
  );
  writeFileSync(
    join(transportsDir, "session-spy", "index.js"),
    `
      globalThis.__sessionSpy = { fetches: [], ended: [] };
      export default class SessionSpyTransport {
        name = "session-spy";
        available() { return true; }
        async fetch(url, _options, context) {
          globalThis.__sessionSpy.fetches.push({
            url,
            sessionKey: context.sessionKey,
            proxyUrl: context.proxyUrl,
          });
          return new Response("ok");
        }
        endSession(key) { globalThis.__sessionSpy.ended.push(key); }
      }
    `,
  );

  try {
    await updateInstanceSettings({ proxyEnabled: "true", proxyUrls: PROXIES });
    await initTransports(true);
    await initEngines(true);
    const engineId = listEngineIds().find((id) => id.includes("session-web"));
    expect(engineId).toBeTruthy();
    const { names } = await transportPicks();
    const spyName = names.find((name) => name.includes("session-spy"));
    expect(spyName).toBeTruthy();
    await setSettings(engineId!, { outgoingTransport: spyName! });
    await fn(engineId!);
  } finally {
    for (const key of ENV_KEYS) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
    clearServerSettingsCache();
    clearTypeCache();
    await initTransports(true);
    rmSync(dir, { recursive: true, force: true });
  }
};

describe("engine run session", () => {
  test("every request in a run shares one session key and one proxy", async () => {
    await withSessionEnv(async (engineId) => {
      const context = createSearchEngineContext(engineId);
      await context.fetch("https://example.com/search?q=one");
      await context.fetch("https://example.com/goto?url=two");
      await context.fetch("https://example.com/goto?url=three");

      const { fetches } = spyLog();
      expect(fetches).toHaveLength(3);
      expect(fetches[0].sessionKey).toBeTruthy();
      expect(new Set(fetches.map((f) => f.sessionKey)).size).toBe(1);
      expect(fetches[0].proxyUrl).toBeTruthy();
      expect(new Set(fetches.map((f) => f.proxyUrl)).size).toBe(1);
    });
  });

  test("separate runs get separate session keys", async () => {
    await withSessionEnv(async (engineId) => {
      const first = createSearchEngineContext(engineId);
      const second = createSearchEngineContext(engineId);
      await first.fetch("https://example.com/a");
      await second.fetch("https://example.com/b");

      const { fetches } = spyLog();
      expect(fetches[0].sessionKey).not.toBe(fetches[1].sessionKey);
    });
  });

  test("ending the run tells the transport once", async () => {
    await withSessionEnv(async (engineId) => {
      const context = createSearchEngineContext(engineId);
      await context.fetch("https://example.com/a");
      await context.fetch("https://example.com/b");
      await endRunSession(context);
      await endRunSession(context);

      const { fetches, ended } = spyLog();
      expect(ended).toEqual([fetches[0].sessionKey!]);
    });
  });

  test("a run that never fetched ends without calling the transport", async () => {
    await withSessionEnv(async (engineId) => {
      const context = createSearchEngineContext(engineId);
      await endRunSession(context);
      expect(spyLog().ended).toEqual([]);
    });
  });
});
