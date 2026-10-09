import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { SearchEngine } from "../../src/server/types/extension";
import { clearServerSettingsCache } from "../../src/server/utils/settings/server-settings";
import { writeDomainList } from "../../src/server/utils/filtering/domain-lists";
import { initServerKey } from "../../src/server/utils/security/server-key";
import { INVALIDATE_SCOPE, publishInvalidate } from "../../src/server/utils/cache/cache-valkey";

const CATALOG_MOD = "../../src/server/extensions/engines/catalog";
const ENGINE_SETTINGS_MOD = "../../src/server/extensions/engines/engine-settings";
const catalogReal = { ...(await import(CATALOG_MOD)) };
const engineSettingsReal = { ...(await import(ENGINE_SETTINGS_MOD)) };

const ENV_KEYS = [
  "DEGOOG_DATA_DIR",
  "DEGOOG_SERVER_SETTINGS_FILE",
  "DEGOOG_PLUGIN_SETTINGS_FILE",
  "DEGOOG_SEARCH_LISTS_FILE",
];
const savedEnv = new Map(ENV_KEYS.map((k) => [k, process.env[k]]));
let tempDir = "";

const engine = (name: string, url: string): SearchEngine => ({
  name,
  executeSearch: async () => [
    { title: "Halo thread", url, snippet: "", source: name },
    { title: `${name} only`, url: `https://${name.toLowerCase()}.test/only`, snippet: "", source: name },
  ],
});

const recall = engine("Recall", "https://redlib.example.com/r/halo/comments/1");
const brave = engine("Brave", "https://www.reddit.com/r/halo/comments/1");
const blocked = engine("Blocky", "https://blocked-site.test/x");
const engines = [
  { id: "recall-engine", instance: recall, score: 1 },
  { id: "brave-engine", instance: brave, score: 1 },
];

let handleSearch: (typeof import("../../src/server/search/handlers"))["handleSearch"];

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "degoog-domain-merge-"));
  process.env.DEGOOG_DATA_DIR = tempDir;
  process.env.DEGOOG_SERVER_SETTINGS_FILE = join(tempDir, "server-settings.json");
  process.env.DEGOOG_PLUGIN_SETTINGS_FILE = join(tempDir, "plugin-settings.json");
  process.env.DEGOOG_SEARCH_LISTS_FILE = join(tempDir, "search-lists.json");
  writeFileSync(process.env.DEGOOG_PLUGIN_SETTINGS_FILE, "{}");
  writeFileSync(
    process.env.DEGOOG_SERVER_SETTINGS_FILE,
    JSON.stringify({
      wizard: true,
      instanceId: "test",
      settings: { domainReplaceEnabled: true, domainBlockEnabled: true },
    }),
  );
  clearServerSettingsCache();
  await publishInvalidate(INVALIDATE_SCOPE.SERVER_SETTINGS);
  await initServerKey();
  await writeDomainList(
    "domainReplaceList",
    "reddit.com -> redlib.example.com\nblocked-site.test -> mirror.test",
  );
  await writeDomainList("domainBlockList", "blocked-site.test");

  const all = [...engines, { id: "blocky-engine", instance: blocked, score: 1 }];
  mock.module(CATALOG_MOD, () => ({
    ...catalogReal,
    getActiveWebEngines: async () => all,
    getEngineMap: () => Object.fromEntries(all.map((e) => [e.id, e.instance])),
    getEngineIdByInstance: (instance: SearchEngine) => all.find((e) => e.instance === instance)?.id,
    getEngineSettingsView: async () => ({}),
    getEngineDefaultTransport: () => undefined,
  }));
  mock.module(ENGINE_SETTINGS_MOD, () => ({ ...engineSettingsReal, engineFullSchema: () => [] }));
  ({ handleSearch } = await import("../../src/server/search/handlers"));
});

afterAll(() => {
  mock.module(CATALOG_MOD, () => catalogReal);
  mock.module(ENGINE_SETTINGS_MOD, () => engineSettingsReal);
  for (const [k, v] of savedEnv) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  clearServerSettingsCache();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("domain replacement before merging (#320)", () => {
  test("a recalled rewritten URL and the same live raw URL become one row with both sources", async () => {
    const res = await handleSearch({
      query: "halo merge",
      engines: {},
      searchType: "web",
      page: 1,
      timeFilter: "any",
      lang: "",
      region: "",
      dateFrom: "",
      dateTo: "",
    });
    const halo = res.results.filter((r) => r.url === "https://redlib.example.com/r/halo/comments/1");
    expect(halo).toHaveLength(1);
    expect(halo[0].sources.sort()).toEqual(["Brave", "Recall"]);
    expect(new Set(res.results.map((r) => r.url)).size).toBe(res.results.length);
  });

  test("blocking still sees the original domain before it gets rewritten", async () => {
    const res = await handleSearch({
      query: "halo block",
      engines: {},
      searchType: "web",
      page: 1,
      timeFilter: "any",
      lang: "",
      region: "",
      dateFrom: "",
      dateTo: "",
    });
    expect(res.results.some((r) => /blocked-site\.test|mirror\.test/.test(r.url))).toBe(false);
    expect(res.results.some((r) => r.title === "Blocky only")).toBe(true);
  });
});
