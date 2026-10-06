import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { clearServerSettingsCache, updateInstanceSettings } from "../../src/server/utils/settings/server-settings";
import { clearTypeCache } from "../../src/server/extensions/engines/search-types";
import { allEngineEntries, initEngines } from "../../src/server/extensions/engines/loader";
import { engineRouteUrl } from "../../src/server/extensions/engines/engine-routes";
import { setSettings } from "../../src/server/utils/settings/plugin-settings";
import { initServerKey } from "../../src/server/utils/security/server-key";
import { searchSingleEngine } from "../../src/server/search/index";
import { signResultThumbnails } from "../../src/server/utils/net/proxy-sign";
import { clearRateLimitState } from "../../src/server/utils/security/rate-limit";
import type { ScoredResult } from "../../src/shared/search-types";

const CLASS_ENGINE = `
export const type = "images";
export default class RouteEngine {
  name = "Route Engine";
  routes = [
    {
      method: "get",
      path: "/thumb",
      handler: async (req) => new Response("thumb:" + new URL(req.url).searchParams.get("id")),
    },
    { method: "post", path: "/costly", rateLimit: true, handler: async () => new Response("ok") },
    { method: "get", path: "/png", handler: async () => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "Content-Type": "image/png" } }) },
  ];
  async executeSearch(query, page, timeFilter, context) {
    return [
      {
        title: "one",
        url: "https://example.org/one",
        snippet: "",
        source: "Route Engine",
        thumbnail: context.routeUrl("/thumb?id=a1"),
        apiBase: context.apiBase,
      },
    ];
  }
}
`;

const MODULE_ENGINE = `
export default {
  name: "Module Route Engine",
  routes: [{ method: "post", path: "/echo", handler: async (req) => new Response(await req.text()) }],
  async executeSearch() { return []; },
};
`;

const PLAIN_ENGINE = `
export default class PlainEngine {
  name = "Plain Engine";
  async executeSearch(query, page, timeFilter, context) {
    return [{ title: "p", url: "https://example.org/p", snippet: "", source: "Plain Engine", apiBase: context.apiBase ?? "none" }];
  }
}
`;

let dir = "";
const prev: Record<string, string | undefined> = {};
const ENV_KEYS = [
  "DEGOOG_DATA_DIR",
  "DEGOOG_ENGINES_DIR",
  "DEGOOG_TRANSPORTS_DIR",
  "DEGOOG_PLUGIN_SETTINGS_FILE",
  "DEGOOG_SERVER_SETTINGS_FILE",
];

let router: { request: (req: Request | string, init?: RequestInit) => Response | Promise<Response> };

const engineId = (folder: string): string =>
  allEngineEntries().find((e) => (e as { folder?: string }).folder === folder)?.id ?? "";

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "degoog-engine-routes-"));
  for (const key of ENV_KEYS) prev[key] = process.env[key];
  process.env.DEGOOG_DATA_DIR = dir;
  process.env.DEGOOG_ENGINES_DIR = join(dir, "engines");
  process.env.DEGOOG_TRANSPORTS_DIR = join(dir, "transports");
  process.env.DEGOOG_PLUGIN_SETTINGS_FILE = join(dir, "plugin-settings.json");
  process.env.DEGOOG_SERVER_SETTINGS_FILE = join(dir, "server-settings.json");
  for (const [folder, source] of [
    ["route-engine", CLASS_ENGINE],
    ["module-route-engine", MODULE_ENGINE],
    ["plain-engine", PLAIN_ENGINE],
  ]) {
    mkdirSync(join(dir, "engines", folder), { recursive: true });
    writeFileSync(join(dir, "engines", folder, "index.js"), source);
  }
  mkdirSync(join(dir, "transports"), { recursive: true });
  writeFileSync(join(dir, "plugin-settings.json"), "{}");
  writeFileSync(
    join(dir, "server-settings.json"),
    JSON.stringify({ settings: { degoogIndexerEnabled: false } }),
  );
  clearServerSettingsCache();
  clearTypeCache();
  await initServerKey();
  await initEngines(true);
  router = (await import("../../src/server/routes/extensions/engine-routes")).default;
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (prev[key] === undefined) delete process.env[key];
    else process.env[key] = prev[key];
  }
  clearServerSettingsCache();
  rmSync(dir, { recursive: true, force: true });
});

describe("engine routes", () => {
  test("a class engine's route is served under /api/engine/<folder>/", async () => {
    const res = await router.request("http://localhost/api/engine/route-engine/thumb?id=a1");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("thumb:a1");
  });

  test("an object engine's routes are served too", async () => {
    const res = await router.request("http://localhost/api/engine/module-route-engine/echo", {
      method: "POST",
      body: "hello",
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("hello");
  });

  test("unknown engines, unknown paths, wrong methods and engines without routes return 404", async () => {
    for (const url of [
      "http://localhost/api/engine/nope/thumb",
      "http://localhost/api/engine/route-engine/missing",
      "http://localhost/api/engine/plain-engine/thumb",
    ]) {
      expect((await router.request(url)).status).toBe(404);
    }
    const wrongMethod = await router.request("http://localhost/api/engine/route-engine/thumb", { method: "POST" });
    expect(wrongMethod.status).toBe(404);
  });

  test("a disabled engine's routes answer 403", async () => {
    const id = engineId("route-engine");
    await setSettings(id, { disabled: "true" });
    const res = await router.request("http://localhost/api/engine/route-engine/thumb?id=a1");
    expect(res.status).toBe(403);
    await setSettings(id, { disabled: "" });
  });

  test("routes that opt into rate limiting use the instance limits, and other routes are not counted", async () => {
    clearRateLimitState();
    await updateInstanceSettings({ rateLimitEnabled: true, rateLimitBurstWindow: "60", rateLimitBurstMax: "2" });
    clearServerSettingsCache();
    const costly = () => router.request("http://localhost/api/engine/route-engine/costly", { method: "POST" });
    for (let i = 0; i < 5; i++) {
      expect((await router.request("http://localhost/api/engine/route-engine/thumb?id=a1")).status).toBe(200);
    }
    expect((await costly()).status).toBe(200);
    expect((await costly()).status).toBe(200);
    const limited = await costly();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
    await updateInstanceSettings({ rateLimitEnabled: false });
    clearServerSettingsCache();
    clearRateLimitState();
  });

  test("engines with routes get apiBase and a relative routeUrl, and its thumbnail goes through the image proxy", async () => {
    const run = await searchSingleEngine(engineId("route-engine"), "q", 1, "any", undefined, undefined, undefined, undefined, undefined, "images", { forceFresh: true });
    const [result] = run.results as (ScoredResult & { apiBase?: string })[];
    expect(result.apiBase).toBe("/api/engine/route-engine");
    expect(result.thumbnail).toBe("/api/engine/route-engine/thumb?id=a1");
    const [signed] = signResultThumbnails([result]);
    expect(signed.thumbnail).toStartWith("/api/proxy/image?url=");
    expect(new URL(`http://x${signed.thumbnail}`).searchParams.get("url")).toBe(result.thumbnail ?? null);
  });

  test("the image proxy serves a signed engine route in-process, and refuses unsigned or unknown ones", async () => {
    const proxy = (await import("../../src/server/routes/proxy")).default;
    const { buildSignedProxyUrl } = await import("../../src/server/utils/net/proxy-sign");
    const png = "/api/engine/route-engine/png";
    const ok = await proxy.request(`http://localhost${buildSignedProxyUrl(png)}`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
    const unsigned = await proxy.request(`http://localhost/api/proxy/image?url=${encodeURIComponent(png)}&sig=00`);
    expect(unsigned.status).toBe(403);
    const notImage = await proxy.request(`http://localhost${buildSignedProxyUrl("/api/engine/route-engine/thumb?id=a1")}`);
    expect(notImage.status).toBe(400);
    const missing = await proxy.request(`http://localhost${buildSignedProxyUrl("/api/engine/nope/png")}`);
    expect(missing.status).toBe(502);
    const traversal = await proxy.request(`http://localhost${buildSignedProxyUrl("/api/engine/route-engine/../../settings")}`);
    expect(traversal.status).toBe(400);
  });

  test.each([["../settings"], ["/thumb/../../settings"], ["/./thumb"], ["/%2e%2e/settings"], ["/thumb\\x"], [""]])(
    "engineRouteUrl refuses the unsafe path %s",
    (path) => {
      expect(() => engineRouteUrl("/api/engine/immich", path)).toThrow();
    },
  );

  test("engines without routes get no apiBase", async () => {
    const run = await searchSingleEngine(engineId("plain-engine"), "q", 1, "any", undefined, undefined, undefined, undefined, undefined, "web", { forceFresh: true });
    const [result] = run.results as (ScoredResult & { apiBase?: string })[];
    expect(result.apiBase).toBe("none");
  });
});
