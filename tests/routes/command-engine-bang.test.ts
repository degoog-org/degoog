import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { SearchEngine } from "../../src/server/types/extension";
import { ImgNsfw, type TimeFilter } from "../../src/server/types/search";
import { clearServerSettingsCache } from "../../src/server/utils/settings/server-settings";
import { clearPluginSettingsCache } from "../../src/server/utils/settings/plugin-settings";
import { writeDomainList } from "../../src/server/utils/filtering/domain-lists";
import { initServerKey } from "../../src/server/utils/security/server-key";
import {
  INVALIDATE_SCOPE,
  publishInvalidate,
} from "../../src/server/utils/cache/cache-valkey";

const REGISTRY_MOD = "../../src/server/extensions/commands/registry";
const CATALOG_MOD = "../../src/server/extensions/engines/catalog";
const ENGINE_SETTINGS_MOD = "../../src/server/extensions/engines/engine-settings";
const LOADER_MOD = "../../src/server/extensions/engines/loader";
const loaderReal = { ...(await import(LOADER_MOD)) };
const registryReal = { ...(await import(REGISTRY_MOD)) };
const catalogReal = { ...(await import(CATALOG_MOD)) };
const engineSettingsReal = { ...(await import(ENGINE_SETTINGS_MOD)) };
const { DEGOOG_ENGINE_ID } = await import(
  "../../src/server/extensions/engines/builtins/degoog"
);

const ENV_KEYS = [
  "DEGOOG_DATA_DIR",
  "DEGOOG_SERVER_SETTINGS_FILE",
  "DEGOOG_PLUGIN_SETTINGS_FILE",
  "DEGOOG_SEARCH_LISTS_FILE",
];
const savedEnv = new Map(ENV_KEYS.map((k) => [k, process.env[k]]));
let tempDir = "";
let queryCounter = 0;
let defaultBangOn = true;
type EngineContext = Parameters<SearchEngine["executeSearch"]>[3];

let seen: { query: string; time: TimeFilter; context?: EngineContext }[] = [];
let preferredTypes: (string | undefined)[] = [];

const ENGINE_ID = "fake-images";

const fakeEngine: SearchEngine = {
  name: "Fake Images",
  executeSearch: async (query, _page, time, context) => {
    seen.push({ query, time: time ?? "any", context });
    return [
      {
        title: "<b>dog</b>",
        url: "https://www.reddit.com/r/dogs?utm_source=bing",
        snippet: "",
        source: "Fake Images",
        thumbnail: "https://tse1.mm.bing.net/th?id=dog",
        imageUrl: "https://cdn.example.com/dog.jpg",
      },
      {
        title: "nope",
        url: "https://blocked.example.com/x",
        snippet: "",
        source: "Fake Images",
        thumbnail: "https://tse1.mm.bing.net/th?id=nope",
      },
    ];
  },
};

let router: { request: (req: Request | string) => Response | Promise<Response> };

const writeSettings = async (extra: Record<string, unknown> = {}): Promise<void> => {
  writeFileSync(
    process.env.DEGOOG_SERVER_SETTINGS_FILE!,
    JSON.stringify({
      wizard: true,
      instanceId: "test",
      settings: { domainReplaceEnabled: true, domainBlockEnabled: true, ...extra },
    }),
  );
  clearServerSettingsCache();
  await publishInvalidate(INVALIDATE_SCOPE.SERVER_SETTINGS);
};

const bang = (params: Record<string, string> = {}): Promise<Response> | Response =>
  router.request(
    `http://localhost/api/command?${new URLSearchParams({
      q: `dog${++queryCounter} !fake`,
      ...params,
    }).toString()}`,
  );

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "degoog-command-bang-"));
  process.env.DEGOOG_DATA_DIR = tempDir;
  process.env.DEGOOG_SERVER_SETTINGS_FILE = join(tempDir, "server-settings.json");
  process.env.DEGOOG_PLUGIN_SETTINGS_FILE = join(tempDir, "plugin-settings.json");
  process.env.DEGOOG_SEARCH_LISTS_FILE = join(tempDir, "search-lists.json");
  writeFileSync(process.env.DEGOOG_PLUGIN_SETTINGS_FILE, "{}");
  await writeSettings();
  await initServerKey();
  await writeDomainList("domainReplaceList", "reddit.com -> redlib.example.com");
  await writeDomainList("domainBlockList", "blocked.example.com");

  const active = [{ id: ENGINE_ID, instance: fakeEngine, score: 1 }];
  mock.module(REGISTRY_MOD, () => ({
    ...registryReal,
    matchBangCommand: (q: string) => ({
      type: "engine",
      engineId: ENGINE_ID,
      query: q.replace(/\s*!\S+$/, ""),
    }),
  }));
  mock.module(LOADER_MOD, () => ({
    ...loaderReal,
    listEngineIds: () => [ENGINE_ID],
  }));
  mock.module(CATALOG_MOD, () => ({
    ...catalogReal,
    getDefaultEngineConfig: () => ({ [ENGINE_ID]: true }),
    getDefaultEngineBangConfig: () => ({ [ENGINE_ID]: defaultBangOn }),
    getEngineSearchType: async (_id: string, preferred?: string) => {
      preferredTypes.push(preferred);
      return "images";
    },
    getEnginesForCustomType: async () => active,
    getActiveWebEngines: async () => active,
    getEngineMap: () => ({ [ENGINE_ID]: fakeEngine }),
    getEngineIdByInstance: (instance: SearchEngine) =>
      instance === fakeEngine ? ENGINE_ID : undefined,
    getEngineSettingsView: async () => ({}),
    getEngineDefaultTransport: () => undefined,
  }));
  mock.module(ENGINE_SETTINGS_MOD, () => ({
    ...engineSettingsReal,
    engineFullSchema: () => [],
  }));
  router = (await import("../../src/server/routes/extensions/commands")).default;
});

beforeEach(async () => {
  seen = [];
  preferredTypes = [];
  defaultBangOn = true;
  await writeSettings();
});

afterAll(() => {
  mock.module(REGISTRY_MOD, () => registryReal);
  mock.module(CATALOG_MOD, () => catalogReal);
  mock.module(LOADER_MOD, () => loaderReal);
  mock.module(ENGINE_SETTINGS_MOD, () => engineSettingsReal);
  for (const [k, v] of savedEnv) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  clearServerSettingsCache();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("GET /api/command engine bang", () => {
  test("runs through the same result pipeline as a normal search", async () => {
    const res = await bang({ type: "images" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("engine");
    expect(body.engineId).toBe(ENGINE_ID);
    expect(body.primaryType).toBe("images");
    expect(body.results).toHaveLength(1);
    const [r] = body.results;
    expect(r.thumbnail).toStartWith("/api/proxy/image?url=");
    expect(r.imageUrl).toStartWith("/api/proxy/image?url=");
    expect(new URL(r.url).hostname).toBe("redlib.example.com");
    expect(r.url).not.toContain("utm_source");
    expect(r.title).toBe("dog");
  });

  test("asks for the web tab when the request carries no type", async () => {
    const res = await bang();
    expect(res.status).toBe(200);
    expect(preferredTypes).toEqual(["web"]);
  });

  test("forwards language, time and image filters to the engine", async () => {
    const res = await bang({ type: "images", lang: "de", time: "week", safeMode: ImgNsfw.ON });
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0].time).toBe("week");
    expect(seen[0].context?.lang).toBe("de");
    expect(seen[0].context?.imageFilter?.nsfw).toBe(ImgNsfw.ON);
  });

  test("POST keeps the query out of the URL and runs the same pipeline", async () => {
    const res = await router.request(
      new Request("http://localhost/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `dog${++queryCounter} !fake`,
          type: "images",
          lang: "it",
          safeMode: ImgNsfw.ON,
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].thumbnail).toStartWith("/api/proxy/image?url=");
    expect(new URL(body.results[0].url).hostname).toBe("redlib.example.com");
    expect(seen[0].context?.lang).toBe("it");
    expect(seen[0].context?.imageFilter?.nsfw).toBe(ImgNsfw.ON);
  });

  test("runs the bang for an engine the visitor keeps out of normal searches", async () => {
    const res = await bang({ type: "images", [ENGINE_ID]: "false", bangs: ENGINE_ID });
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(1);
  });

  test("refuses a bang the visitor has turned off", async () => {
    const res = await bang({ type: "images", [ENGINE_ID]: "true", bangs: "" });
    expect(res.status).toBe(403);
    expect(seen).toHaveLength(0);
  });

  test("falls back to the instance bang default when the visitor sends none", async () => {
    defaultBangOn = false;
    const res = await bang({ type: "images" });
    expect(res.status).toBe(403);
    expect(seen).toHaveLength(0);
  });

  test("POST follows the bang list, not the engine list", async () => {
    const post = (body: Record<string, unknown>) =>
      router.request(
        new Request("http://localhost/api/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: `dog${++queryCounter} !fake`, ...body }),
        }),
      );
    expect((await post({ engines: [], bangs: [ENGINE_ID] })).status).toBe(200);
    expect((await post({ engines: [ENGINE_ID], bangs: [] })).status).toBe(403);
    expect(seen).toHaveLength(1);
  });

  test("the commands list hides bangs the visitor has turned off", async () => {
    const triggers = async (query: string): Promise<string[]> => {
      const res = await router.request(`http://localhost/api/commands?${query}`);
      const body = (await res.json()) as { commands: { trigger: string }[] };
      return body.commands.map((c) => c.trigger);
    };
    expect(await triggers("bangs=")).not.toContain("fake");
  });

  test("refuses an engine the admin has disabled", async () => {
    writeFileSync(
      process.env.DEGOOG_PLUGIN_SETTINGS_FILE!,
      JSON.stringify({ [ENGINE_ID]: { disabled: "true" } }),
    );
    clearPluginSettingsCache();
    try {
      const res = await bang({ type: "images" });
      expect(res.status).toBe(403);
      expect(seen).toHaveLength(0);
    } finally {
      writeFileSync(process.env.DEGOOG_PLUGIN_SETTINGS_FILE!, "{}");
      clearPluginSettingsCache();
    }
  });

  test("enforces the search API key like /api/search", async () => {
    await writeSettings({ apiKeySearchEnabled: true });
    const res = await bang({ type: "images" });
    expect(res.status).toBe(401);
    expect(seen).toHaveLength(0);
  });
});

describe("singleEngineConfig", () => {
  test("keeps the index engine out of other engines' bangs", () => {
    expect(catalogReal.singleEngineConfig("brave")).toEqual({
      brave: true,
      [DEGOOG_ENGINE_ID]: false,
    });
    expect(catalogReal.singleEngineConfig(DEGOOG_ENGINE_ID)).toEqual({
      [DEGOOG_ENGINE_ID]: true,
    });
  });
});
