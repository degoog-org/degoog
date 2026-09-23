import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { SearchEngine } from "../../src/server/types/extension";
import type { ScoredResult, SearchResult } from "../../src/shared/search-types";

const ENGINES_MOD = "../../src/server/extensions/engines/catalog";
const ENGINE_SETTINGS_MOD = "../../src/server/extensions/engines/engine-settings";
const SERVER_SETTINGS_MOD = "../../src/server/utils/settings/server-settings";
const PLUGIN_SETTINGS_MOD = "../../src/server/utils/settings/plugin-settings";
const INDEXER_MOD = "../../src/server/indexer/store/record";
const INTERCEPTS_MOD = "../../src/server/utils/extension-support/run-interceptors";

const { initServerKey } = await import("../../src/server/utils/security/server-key");
await initServerKey();

const enginesReal = { ...(await import(ENGINES_MOD)) };
const engineSettingsReal = { ...(await import(ENGINE_SETTINGS_MOD)) };
const serverSettingsReal = { ...(await import(SERVER_SETTINGS_MOD)) };
const pluginSettingsReal = { ...(await import(PLUGIN_SETTINGS_MOD)) };
const indexerReal = { ...(await import(INDEXER_MOD)) };
const interceptsReal = { ...(await import(INTERCEPTS_MOD)) };

const { DEGOOG_ENGINE_NAME } = await import("../../src/shared/search-types");

type EngineEntry = { id: string; instance: SearchEngine; score?: number };

type IndexCall = {
  enabled: boolean;
  query: string;
  engineType: string;
  urls: string[];
  filtersJson: string;
};

type Overrides = {
  searchType?: string;
  lang?: string;
  timeFilter?: string;
};

let indexCalls: IndexCall[] = [];
let engineCalls: { name: string; page: number; lang?: string; timeFilter: string }[] = [];
let indexedUrls: string[] = [];
let queryCounter = 0;

const uniqueQuery = (label: string): string => `${label}-${++queryCounter}`;

const idxOf = (r: ScoredResult): string | undefined =>
  (r as ScoredResult & { idx?: string }).idx;

const makeResult = (source: string, n: number): SearchResult => ({
  title: `${source} ${n}`,
  url: `https://${source.toLowerCase()}.test/${n}`,
  snippet: `${source} snippet ${n}`,
  source,
});

const makeEngine = (
  name: string,
  count: number,
  opts: { pages?: number; thumbnail?: boolean; score?: number } = {},
): EngineEntry => ({
  id: `${name.toLowerCase()}-engine`,
  score: opts.score,
  instance: {
    name,
    executeSearch: async (_query, page, timeFilter, context) => {
      engineCalls.push({
        name,
        page: page ?? 1,
        lang: context?.lang,
        timeFilter: String(timeFilter),
      });
      if (opts.pages !== undefined) context?.pagination?.({ total: opts.pages });
      return Array.from({ length: count }, (_u, i) => {
        const base = makeResult(name, i + 1);
        return opts.thumbnail
          ? { ...base, thumbnail: `https://cdn.test/${name}-${i + 1}.jpg` }
          : base;
      });
    },
  },
});

const brokenEngine = (name: string): EngineEntry => ({
  id: `${name.toLowerCase()}-engine`,
  instance: {
    name,
    executeSearch: async () => {
      throw new Error(`${name} exploded`);
    },
  },
});

const harness = (opts: {
  engines?: EngineEntry[];
  settings?: Record<string, unknown>;
  overrides?: Overrides;
  indexReturns?: string[];
}): void => {
  const engines = opts.engines ?? [];
  indexedUrls = opts.indexReturns ?? [];

  const active = engines.map((e) => ({
    id: e.id,
    instance: e.instance,
    score: e.score ?? 1,
  }));

  mock.module(ENGINES_MOD, () => ({
    ...enginesReal,
    getActiveWebEngines: async () => active,
    getEnginesForCustomType: async () => active,
    getEngineMap: () =>
      Object.fromEntries(engines.map((e) => [e.id, e.instance])),
    getEngineIdByInstance: (instance: SearchEngine) =>
      engines.find((e) => e.instance === instance)?.id,
    getEngineSettingsView: async () => ({}),
    getEngineDefaultTransport: () => undefined,
  }));

  mock.module(ENGINE_SETTINGS_MOD, () => ({
    ...engineSettingsReal,
    engineFullSchema: () => [],
  }));

  mock.module(SERVER_SETTINGS_MOD, () => ({
    ...serverSettingsReal,
    getInstanceSettings: async () => opts.settings ?? {},
  }));

  mock.module(PLUGIN_SETTINGS_MOD, () => ({
    ...pluginSettingsReal,
    getSettings: async () => ({}),
  }));

  mock.module(INTERCEPTS_MOD, () => ({
    ...interceptsReal,
    runIntercepts: async (query: string) => ({
      query,
      overrides: opts.overrides ?? {},
    }),
  }));

  mock.module(INDEXER_MOD, () => ({
    ...indexerReal,
    maybeIndex: async (
      enabled: boolean,
      query: string,
      engineType: string,
      results: ScoredResult[],
      filtersJson = "",
    ) => {
      indexCalls.push({
        enabled,
        query,
        engineType,
        urls: results.map((r) => r.url),
        filtersJson,
      });
      return indexedUrls;
    },
  }));
};

const handlers = async () =>
  await import("../../src/server/search/handlers");

const baseParams = (query: string) => ({
  query,
  engines: {},
  searchType: "web" as const,
  page: 1,
  timeFilter: "any" as const,
  lang: "",
  dateFrom: "",
  dateTo: "",
  imageFilter: undefined,
});

beforeEach(() => {
  indexCalls = [];
  engineCalls = [];
});

afterEach(() => {
  mock.module(ENGINES_MOD, () => enginesReal);
  mock.module(ENGINE_SETTINGS_MOD, () => engineSettingsReal);
  mock.module(SERVER_SETTINGS_MOD, () => serverSettingsReal);
  mock.module(PLUGIN_SETTINGS_MOD, () => pluginSettingsReal);
  mock.module(INDEXER_MOD, () => indexerReal);
  mock.module(INTERCEPTS_MOD, () => interceptsReal);
});

describe("handleSearch merge and response shape", () => {
  test("no active engines yields an empty response, not an error", async () => {
    harness({ engines: [] });
    const { handleSearch } = await handlers();
    const out = await handleSearch(baseParams(uniqueQuery("empty")));

    expect(out.results).toEqual([]);
    expect(out.engineTimings).toEqual([]);
    expect(out.relatedSearches).toEqual([]);
    expect(out.totalTime).toBe(0);
    expect(out.type).toBe("web");
  });

  test("scores by position within each engine, then sorts across engines", async () => {
    harness({ engines: [makeEngine("Alpha", 2), makeEngine("Beta", 1)] });
    const { handleSearch } = await handlers();
    const out = await handleSearch(baseParams(uniqueQuery("merge")));

    expect(out.results.map((r) => r.title)).toEqual([
      "Alpha 1",
      "Beta 1",
      "Alpha 2",
    ]);
    expect(out.results.map((r) => r.score)).toEqual([10, 10, 9]);
    expect(out.results.map((r) => r.sources)).toEqual([
      ["Alpha"],
      ["Beta"],
      ["Alpha"],
    ]);
    expect(out.engineTimings.map((t) => t.name)).toEqual(["Alpha", "Beta"]);
    expect(out.engineTimings.map((t) => t.resultCount)).toEqual([2, 1]);
  });

  test("an engine score multiplies the position score", async () => {
    harness({
      engines: [makeEngine("Alpha", 1), makeEngine("Beta", 1, { score: 2 })],
    });
    const { handleSearch } = await handlers();
    const out = await handleSearch(baseParams(uniqueQuery("multiplier")));

    expect(out.results.map((r) => [r.title, r.score])).toEqual([
      ["Beta 1", 20],
      ["Alpha 1", 10],
    ]);
  });

  test("the same url from two engines merges, gains five, and keeps both sources", async () => {
    const shared: SearchResult = {
      title: "Shared",
      url: "https://shared.test/1",
      snippet: "short",
      source: "Alpha",
    };
    const engines: EngineEntry[] = [
      {
        id: "alpha-engine",
        instance: { name: "Alpha", executeSearch: async () => [shared] },
      },
      {
        id: "beta-engine",
        instance: {
          name: "Beta",
          executeSearch: async () => [
            { ...shared, source: "Beta", snippet: "a much longer snippet" },
          ],
        },
      },
    ];
    harness({ engines });
    const { handleSearch } = await handlers();
    const out = await handleSearch(baseParams(uniqueQuery("dedupe")));

    expect(out.results).toHaveLength(1);
    expect(out.results[0].score).toBe(25);
    expect(out.results[0].sources).toEqual(["Alpha", "Beta"]);
    expect(out.results[0].snippet).toBe("a much longer snippet");
  });

  test("a thrown engine is a status on its timing, never a thrown search", async () => {
    harness({ engines: [makeEngine("Alpha", 1), brokenEngine("Boom")] });
    const { handleSearch } = await handlers();
    const out = await handleSearch(baseParams(uniqueQuery("broken")));

    expect(out.results.map((r) => r.title)).toEqual(["Alpha 1"]);
    expect(out.engineTimings.map((t) => t.name)).toEqual(["Alpha", "Boom"]);
    const boom = out.engineTimings.find((t) => t.name === "Boom");
    expect(boom?.resultCount).toBe(0);
    expect(boom?.status).toBeTruthy();
  });

  test("page total is the agreed total across engines", async () => {
    harness({
      engines: [
        makeEngine("Alpha", 1, { pages: 7 }),
        makeEngine("Beta", 1, { pages: 4 }),
      ],
    });
    const { handleSearch } = await handlers();
    const out = await handleSearch(baseParams(uniqueQuery("pages")));

    expect(out.totalPages).toBeDefined();
    expect(out.totalPages).toMatchSnapshot();
  });

  test("thumbnails come back signed, plain results untouched", async () => {
    harness({ engines: [makeEngine("Alpha", 1, { thumbnail: true })] });
    const { handleSearch } = await handlers();
    const out = await handleSearch(baseParams(uniqueQuery("thumbs")));

    expect(out.results[0].thumbnail).not.toBe("https://cdn.test/Alpha-1.jpg");
    expect(out.results[0].thumbnail).toContain("/api/proxy/image");
    expect(out.results[0].url).toBe("https://alpha.test/1");
  });
});

describe("handleSearch intercept overrides reach the engines and the index", () => {
  test("overridden type, lang and time filter are what the engines run with", async () => {
    harness({
      engines: [makeEngine("Alpha", 1)],
      overrides: { searchType: "images", lang: "fr", timeFilter: "week" },
    });
    const { handleSearch } = await handlers();
    const out = await handleSearch({
      ...baseParams(uniqueQuery("overrides")),
      searchType: "web",
      lang: "en",
      timeFilter: "any",
    });

    expect(out.type).toBe("images");
    expect(engineCalls).toHaveLength(1);
    expect(engineCalls[0].lang).toBe("fr");
    expect(engineCalls[0].timeFilter).toBe("week");
    expect(indexCalls[0].engineType).toBe("images");
    expect(indexCalls[0].filtersJson).toContain("fr");
  });
});

describe("handleSearch indexing basis", () => {
  test("the indexer sees results without the degoog engine, display keeps them", async () => {
    harness({
      engines: [makeEngine("Alpha", 1), makeEngine(DEGOOG_ENGINE_NAME, 1)],
      settings: { degoogIndexerEnabled: true },
    });
    const { handleSearch } = await handlers();
    const out = await handleSearch(baseParams(uniqueQuery("basis")));

    const displayed = out.results.map((r) => r.source);
    expect(displayed).toContain("Alpha");
    expect(displayed).toContain(DEGOOG_ENGINE_NAME);

    expect(indexCalls).toHaveLength(1);
    expect(indexCalls[0].enabled).toBe(true);
    expect(indexCalls[0].urls).toEqual(["https://alpha.test/1"]);
  });

  test("the indexer is told it is off when the setting is off", async () => {
    harness({ engines: [makeEngine("Alpha", 1)], settings: {} });
    const { handleSearch } = await handlers();
    await handleSearch(baseParams(uniqueQuery("indexoff")));

    expect(indexCalls[0].enabled).toBe(false);
  });

  test("urls the indexer reports back are tagged idx=indexing, others untagged", async () => {
    harness({
      engines: [makeEngine("Alpha", 2)],
      settings: { degoogIndexerEnabled: true },
      indexReturns: ["https://alpha.test/1"],
    });
    const { handleSearch } = await handlers();
    const out = await handleSearch(baseParams(uniqueQuery("tagged")));

    expect(out.results.map((r) => [r.url, idxOf(r)])).toEqual([
      ["https://alpha.test/1", "indexing"],
      ["https://alpha.test/2", undefined],
    ]);
  });

  test("results recalled from the local index are tagged idx=recalled", async () => {
    harness({
      engines: [makeEngine("Alpha", 1), makeEngine(DEGOOG_ENGINE_NAME, 1)],
      settings: { degoogIndexerEnabled: true },
    });
    const { handleSearch } = await handlers();
    const out = await handleSearch(baseParams(uniqueQuery("recalled")));

    const bySource = Object.fromEntries(
      out.results.map((r) => [r.source, idxOf(r)]),
    );
    expect(bySource[DEGOOG_ENGINE_NAME]).toBe("recalled");
    expect(bySource.Alpha).toBeUndefined();
  });
});

describe("handleRetry", () => {
  test("a cold retry returns only the retried engine", async () => {
    harness({ engines: [makeEngine("Alpha", 2), makeEngine("Beta", 1)] });
    const { handleRetry } = await handlers();
    const out = await handleRetry({
      ...baseParams(uniqueQuery("coldretry")),
      engineName: "alpha-engine",
    });

    expect(out.results.map((r) => r.title)).toEqual(["Alpha 1", "Alpha 2"]);
    expect(out.timing.name).toBe("Alpha");
    expect(out.engineTimings.map((t) => t.name)).toEqual(["Alpha"]);
    expect(out.relatedSearches).toEqual([]);
  });

  test("a warm retry merges the retried engine with its cached siblings", async () => {
    const query = uniqueQuery("warmretry");
    harness({ engines: [makeEngine("Alpha", 2), makeEngine("Beta", 1)] });
    const { handleSearch, handleRetry } = await handlers();

    await handleSearch(baseParams(query));
    const out = await handleRetry({
      ...baseParams(query),
      engineName: "alpha-engine",
    });

    expect(out.results.map((r) => r.title).sort()).toEqual([
      "Alpha 1",
      "Alpha 2",
      "Beta 1",
    ]);
    expect(out.engineTimings.map((t) => t.name).sort()).toEqual([
      "Alpha",
      "Beta",
    ]);
  });

  test("retry forces the retried engine fresh while siblings stay cached", async () => {
    const query = uniqueQuery("freshretry");
    harness({ engines: [makeEngine("Alpha", 1), makeEngine("Beta", 1)] });
    const { handleSearch, handleRetry } = await handlers();

    await handleSearch(baseParams(query));
    engineCalls = [];
    await handleRetry({ ...baseParams(query), engineName: "alpha-engine" });

    expect(engineCalls.map((c) => c.name)).toEqual(["Alpha"]);
  });

  test("retry drops recalled results from indexing while still displaying them", async () => {
    const query = uniqueQuery("retryindex");
    harness({
      engines: [makeEngine("Alpha", 1), makeEngine(DEGOOG_ENGINE_NAME, 1)],
      settings: { degoogIndexerEnabled: true },
    });
    const { handleRetry } = await handlers();
    indexCalls = [];

    const out = await handleRetry({
      ...baseParams(query),
      engineName: "alpha-engine",
    });

    expect(out.results.map((r) => r.source).sort()).toEqual(
      [DEGOOG_ENGINE_NAME, "Alpha"].sort(),
    );
    expect(indexCalls).toHaveLength(1);
    expect(indexCalls[0].urls).toEqual(["https://alpha.test/1"]);
  });
});
