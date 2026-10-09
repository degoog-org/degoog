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
import { clearRoster, rosterIdFor } from "../../src/server/utils/net/proxy-roster";
import { benchedUntil } from "../../src/server/utils/net/proxy-bench";
import { searchSingleEngine } from "../../src/server/search";

type SpyLog = {
  fetches: { url: string; sessionKey?: string; proxyUrl?: string; egressKey?: string }[];
  ended: string[];
  proxied: boolean;
  carried: (string | null)[];
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
  clearRoster();
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
        async executeSearch(query, page, _time, context) {
          await context.fetch(\`https://pages.test/search?q=\${query}&p=\${page}\`);
          if (page === 1) context.carry({ token: \`token-for-\${query}\` });
          globalThis.__sessionSpy.carried.push(context.carried?.token ?? null);
          return [{ title: "a", url: \`https://a.test/\${page}\`, snippet: "", source: "Session" }];
        }
      }
    `,
  );
  writeFileSync(
    join(transportsDir, "session-spy", "index.js"),
    `
      globalThis.__sessionSpy = { fetches: [], ended: [], proxied: true, carried: [] };
      export default class SessionSpyTransport {
        name = "session-spy";
        get usesContextProxy() { return globalThis.__sessionSpy.proxied; }
        available() { return true; }
        async fetch(url, _options, context) {
          globalThis.__sessionSpy.fetches.push({
            url,
            sessionKey: context.sessionKey,
            proxyUrl: context.proxyUrl,
            egressKey: context.egressKey,
          });
          if (url.includes("dead-proxy")) {
            const err = new Error("proxy refused");
            err.name = "ProxyConnectError";
            throw err;
          }
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
    clearRoster();
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

  test("a run refuses new requests once it has ended", async () => {
    await withSessionEnv(async (engineId) => {
      const context = createSearchEngineContext(engineId);
      await context.fetch("https://example.com/a");
      await endRunSession(context);

      await expect(context.fetch("https://example.com/late")).rejects.toThrow(
        "engine run already ended",
      );
      const { fetches, ended } = spyLog();
      expect(fetches.map((f) => f.url)).toEqual(["https://example.com/a"]);
      expect(ended).toHaveLength(1);
    });
  });

  test("every request in a run carries the same egress key and never the proxy url", async () => {
    await withSessionEnv(async (engineId) => {
      const context = createSearchEngineContext(engineId);
      await context.fetch("https://egress.test/a");
      await context.fetch("https://egress.test/b");

      const { fetches } = spyLog();
      expect(fetches[0].egressKey).toMatch(/^[0-9a-f]{24}\.0$/);
      expect(fetches[1].egressKey).toBe(fetches[0].egressKey);
      expect(fetches[0].egressKey).not.toContain("127.0.0.1");
    });
  });

  test("a run that ends in a captcha cools its proxy down for that site", async () => {
    await withSessionEnv(async (engineId) => {
      const context = createSearchEngineContext(engineId);
      await context.fetch("https://captcha-run.test/search");
      await endRunSession(context, "captcha");

      const used = spyLog().fetches[0];
      const id = await rosterIdFor(used.proxyUrl!);
      expect(await benchedUntil(id, "captcha-run.test")).toBeGreaterThan(Date.now());

      const next = createSearchEngineContext(engineId);
      await next.fetch("https://captcha-run.test/search");
      expect(spyLog().fetches[1].proxyUrl).not.toBe(used.proxyUrl);
    });
  });

  test("a transport that does not use degoog's proxy never gets the proxy blamed", async () => {
    await withSessionEnv(async (engineId) => {
      spyLog().proxied = false;
      const context = createSearchEngineContext(engineId);
      await context.fetch("https://own-egress.test/search");
      await endRunSession(context, "captcha");

      const used = spyLog().fetches[0];
      const id = await rosterIdFor(used.proxyUrl!);
      expect(await benchedUntil(id, "own-egress.test")).toBe(0);
    });
  });

  test("a proxy that can't be reached counts as connect trouble whatever the engine reports", async () => {
    await withSessionEnv(async (engineId) => {
      const context = createSearchEngineContext(engineId);
      await expect(context.fetch("https://dead-proxy.test/search")).rejects.toThrow(
        "proxy refused",
      );
      await endRunSession(context, "network");

      const used = spyLog().fetches[0];
      const id = await rosterIdFor(used.proxyUrl!);
      expect(await benchedUntil(id, "dead-proxy.test")).toBeGreaterThan(Date.now());
    });
  });

  test("a clean run changes nothing", async () => {
    await withSessionEnv(async (engineId) => {
      const context = createSearchEngineContext(engineId);
      await context.fetch("https://clean-run.test/search");
      await endRunSession(context, "ok");

      const used = spyLog().fetches[0];
      const id = await rosterIdFor(used.proxyUrl!);
      expect(await benchedUntil(id, "clean-run.test")).toBe(0);
    });
  });

  test("later pages of a query use page one's proxy and get its carried state", async () => {
    await withSessionEnv(async () => {
      const first = await searchSingleEngine("Session", "pager");
      const second = await searchSingleEngine("Session", "pager", 2);
      const third = await searchSingleEngine("Session", "pager", 3);
      await searchSingleEngine("Session", "other");

      const { fetches, carried } = spyLog();
      expect(fetches).toHaveLength(4);
      expect(fetches[1].proxyUrl).toBe(fetches[0].proxyUrl);
      expect(fetches[2].proxyUrl).toBe(fetches[0].proxyUrl);
      expect(fetches[3].proxyUrl).not.toBe(fetches[0].proxyUrl);
      expect(carried).toEqual([null, "token-for-pager", "token-for-pager", null]);
      for (const run of [first, second, third]) {
        expect(run).not.toHaveProperty("proxyId");
        expect(run).not.toHaveProperty("carry");
      }
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
