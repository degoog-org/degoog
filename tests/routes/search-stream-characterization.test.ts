import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { SearchEngine } from "../../src/server/types/extension";
import type { ScoredResult, SearchResult } from "../../src/shared/search-types";

const { initServerKey } = await import("../../src/server/utils/security/server-key");
await initServerKey();

const ENGINES_MOD = "../../src/server/extensions/engines/catalog";
const ENGINE_SETTINGS_MOD = "../../src/server/extensions/engines/engine-settings";
const SERVER_SETTINGS_MOD = "../../src/server/utils/settings/server-settings";
const PLUGIN_SETTINGS_MOD = "../../src/server/utils/settings/plugin-settings";
const INDEXER_MOD = "../../src/server/indexer/store/record";
const INTERCEPTS_MOD = "../../src/server/utils/extension-support/run-interceptors";
const OUTGOING_MOD = "../../src/server/utils/net/outgoing";

const enginesReal = { ...(await import(ENGINES_MOD)) };
const engineSettingsReal = { ...(await import(ENGINE_SETTINGS_MOD)) };
const serverSettingsReal = { ...(await import(SERVER_SETTINGS_MOD)) };
const pluginSettingsReal = { ...(await import(PLUGIN_SETTINGS_MOD)) };
const indexerReal = { ...(await import(INDEXER_MOD)) };
const interceptsReal = { ...(await import(INTERCEPTS_MOD)) };
const outgoingReal = { ...(await import(OUTGOING_MOD)) };

const { DEGOOG_ENGINE_NAME } = await import("../../src/shared/search-types");

type EngineEntry = { id: string; instance: SearchEngine; score?: number };
type SseEvent = { event: string; data: Record<string, unknown> };

let indexCalls: { enabled: boolean; urls: string[] }[] = [];
let attemptsByEngine: Record<string, number> = {};
let queryCounter = 0;

const uniqueQuery = (label: string): string => `${label}-${++queryCounter}`;

const makeResult = (source: string, n: number): SearchResult => ({
  title: `${source} ${n}`,
  url: `https://${source.toLowerCase()}.test/${n}`,
  snippet: `${source} snippet ${n}`,
  source,
});

const makeEngine = (name: string, count: number, pages?: number): EngineEntry => ({
  id: `${name.toLowerCase()}-engine`,
  instance: {
    name,
    executeSearch: async (_query, _page, _timeFilter, context) => {
      attemptsByEngine[name] = (attemptsByEngine[name] ?? 0) + 1;
      if (pages !== undefined) context?.pagination?.({ total: pages });
      return Array.from({ length: count }, (_u, i) => makeResult(name, i + 1));
    },
  },
});

const emptyThenFull = (name: string, emptyRuns: number): EngineEntry => ({
  id: `${name.toLowerCase()}-engine`,
  instance: {
    name,
    executeSearch: async () => {
      const attempt = (attemptsByEngine[name] = (attemptsByEngine[name] ?? 0) + 1);
      return attempt > emptyRuns ? [makeResult(name, 1)] : [];
    },
  },
});

const harness = (opts: {
  engines?: EngineEntry[];
  settings?: Record<string, unknown>;
  indexReturns?: string[];
}): void => {
  const engines = opts.engines ?? [];
  const active = engines.map((e) => ({
    id: e.id,
    instance: e.instance,
    score: e.score ?? 1,
  }));

  mock.module(ENGINES_MOD, () => ({
    ...enginesReal,
    getActiveWebEngines: async () => active,
    getEnginesForCustomType: async () => active,
    getEngineMap: () => Object.fromEntries(engines.map((e) => [e.id, e.instance])),
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
    runIntercepts: async (query: string) => ({ query, overrides: {} }),
  }));
  mock.module(INDEXER_MOD, () => ({
    ...indexerReal,
    maybeIndex: async (
      enabled: boolean,
      _query: string,
      _type: string,
      results: ScoredResult[],
    ) => {
      indexCalls.push({ enabled, urls: results.map((r) => r.url) });
      return opts.indexReturns ?? [];
    },
  }));
};

const call = async (query: string, extra = ""): Promise<Response> => {
  const router = (await import("../../src/server/routes/search/stream")).default;
  return router.request(
    new Request(`http://localhost/api/search/stream?q=${encodeURIComponent(query)}${extra}`),
  );
};

const readEvents = async (res: Response): Promise<SseEvent[]> => {
  const raw = await res.text();
  return raw
    .split("\n\n")
    .filter((chunk) => chunk.trim().length > 0)
    .map((chunk) => {
      const event = /^event: (.+)$/m.exec(chunk)?.[1] ?? "";
      const data = /^data: (.+)$/m.exec(chunk)?.[1] ?? "{}";
      return { event, data: JSON.parse(data) as Record<string, unknown> };
    });
};

beforeEach(() => {
  indexCalls = [];
  attemptsByEngine = {};
});

afterEach(() => {
  mock.module(ENGINES_MOD, () => enginesReal);
  mock.module(ENGINE_SETTINGS_MOD, () => engineSettingsReal);
  mock.module(SERVER_SETTINGS_MOD, () => serverSettingsReal);
  mock.module(PLUGIN_SETTINGS_MOD, () => pluginSettingsReal);
  mock.module(INDEXER_MOD, () => indexerReal);
  mock.module(INTERCEPTS_MOD, () => interceptsReal);
});

describe("GET /api/search/stream request handling", () => {
  test("a blank query is rejected before any engine runs", async () => {
    harness({ engines: [makeEngine("Alpha", 1)] });
    const res = await call("   ");

    expect(res.status).toBe(400);
    expect(attemptsByEngine).toEqual({});
  });

  test("no active engines answers plain JSON rather than an event stream", async () => {
    harness({ engines: [] });
    const res = await call(uniqueQuery("noengines"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toMatchObject({
      results: [],
      engineTimings: [],
      relatedSearches: [],
      totalTime: 0,
    });
  });

  test("a live stream carries the event-stream headers", async () => {
    harness({ engines: [makeEngine("Alpha", 1)] });
    const res = await call(uniqueQuery("headers"));

    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    await res.text();
  });
});

describe("GET /api/search/stream event sequence", () => {
  test("one engine-result per engine, then a single done", async () => {
    harness({ engines: [makeEngine("Alpha", 2), makeEngine("Beta", 1)] });
    const events = await readEvents(await call(uniqueQuery("sequence")));

    expect(events.map((e) => e.event)).toEqual([
      "engine-result",
      "engine-result",
      "done",
    ]);
    expect(events.at(-1)?.event).toBe("done");
  });

  test("each engine-result carries that engine's name and the merged set so far", async () => {
    harness({ engines: [makeEngine("Alpha", 2), makeEngine("Beta", 1)] });
    const events = await readEvents(await call(uniqueQuery("cumulative")));
    const results = events.filter((e) => e.event === "engine-result");

    const counts = results.map(
      (e) => (e.data.results as ScoredResult[]).length,
    );
    expect(counts).toEqual([2, 3]);
    expect(results.map((e) => e.data.engine)).toEqual(["Alpha", "Beta"]);
    expect(results.every((e) => e.data.retry === false)).toBe(true);
  });

  test("an empty engine finishing last still sends signed thumbnails", async () => {
    const withThumb: EngineEntry = {
      id: "thumb-engine",
      instance: {
        name: "Thumb",
        executeSearch: async () => [
          { ...makeResult("Thumb", 1), thumbnail: "https://img.test/t.png" },
        ],
      },
    };
    const lateEmpty: EngineEntry = {
      id: "late-engine",
      instance: {
        name: "Late",
        executeSearch: async () => {
          await Bun.sleep(20);
          return [];
        },
      },
    };
    harness({ engines: [withThumb, lateEmpty] });
    const events = await readEvents(await call(uniqueQuery("late-empty")));
    const late = events.find((e) => e.event === "engine-result" && e.data.engine === "Late");
    const [only] = late?.data.results as ScoredResult[];

    expect(only.thumbnail).toStartWith("/api/proxy/image?url=");
  });

  test("done reports timings, page total and the indexed urls", async () => {
    harness({
      engines: [makeEngine("Alpha", 1, 6), makeEngine("Beta", 1, 3)],
      settings: { degoogIndexerEnabled: true },
      indexReturns: ["https://alpha.test/1"],
    });
    const events = await readEvents(await call(uniqueQuery("done")));
    const done = events.at(-1);

    expect(done?.event).toBe("done");
    expect(done?.data.relatedSearches).toEqual([]);
    expect(
      (done?.data.engineTimings as { name: string }[]).map((t) => t.name).sort(),
    ).toEqual(["Alpha", "Beta"]);
    expect(done?.data.indexedUrls).toEqual(["https://alpha.test/1"]);
    expect(done?.data.totalPages).toMatchSnapshot();
  });

  test("the stream indexes a basis with the degoog engine stripped out", async () => {
    harness({
      engines: [makeEngine("Alpha", 1), makeEngine(DEGOOG_ENGINE_NAME, 1)],
      settings: { degoogIndexerEnabled: true },
    });
    await readEvents(await call(uniqueQuery("basis")));

    expect(indexCalls).toHaveLength(1);
    expect(indexCalls[0].enabled).toBe(true);
    expect(indexCalls[0].urls).toEqual(["https://alpha.test/1"]);
  });

  test("the indexer is told it is off when the setting is off", async () => {
    harness({ engines: [makeEngine("Alpha", 1)], settings: {} });
    await readEvents(await call(uniqueQuery("indexoff")));

    expect(indexCalls[0].enabled).toBe(false);
  });
});

describe("GET /api/search/stream client disconnect", () => {
  test("cancelling the reader aborts the engine's outgoing request", async () => {
    let captured: AbortSignal | undefined;
    let releaseFetch: (() => void) | undefined;
    let announceFetch: (() => void) | undefined;
    const fetchStarted = new Promise<void>((resolve) => {
      announceFetch = resolve;
    });

    mock.module(OUTGOING_MOD, () => ({
      ...outgoingReal,
      outgoingFetch: async (_url: string, init?: RequestInit) => {
        captured = init?.signal ?? undefined;
        announceFetch?.();
        await new Promise<void>((resolve) => {
          releaseFetch = resolve;
        });
        return new Response("", { status: 200 });
      },
    }));

    const fetching: EngineEntry = {
      id: "fetching-engine",
      instance: {
        name: "Fetching",
        executeSearch: async (_query, _page, _timeFilter, context) => {
          await context?.fetch?.("https://engine.test/search");
          return [];
        },
      },
    };
    harness({ engines: [fetching] });

    const res = await call(uniqueQuery("cancel"));
    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    await fetchStarted;
    expect(captured).toBeDefined();
    expect(captured?.aborted).toBe(false);

    await reader?.cancel();

    expect(captured?.aborted).toBe(true);
    releaseFetch?.();
    mock.module(OUTGOING_MOD, () => outgoingReal);
  });
});

describe("GET /api/search/stream auto-retry", () => {
  test("an empty engine is retried and emits engine-retry until it yields", async () => {
    harness({
      engines: [emptyThenFull("Flaky", 2)],
      settings: { streamingAutoRetry: true, streamingMaxRetries: "3" },
    });
    const events = await readEvents(await call(uniqueQuery("retry")));

    expect(events.map((e) => e.event)).toEqual([
      "engine-retry",
      "engine-retry",
      "engine-result",
      "done",
    ]);
    expect(attemptsByEngine.Flaky).toBe(3);
    const final = events.find((e) => e.event === "engine-result");
    expect(final?.data.retry).toBe(true);
    expect(final?.data.attempt).toBe(2);
  });

  test("retries stop at the configured maximum", async () => {
    harness({
      engines: [emptyThenFull("Hopeless", 99)],
      settings: { streamingAutoRetry: true, streamingMaxRetries: "2" },
    });
    const events = await readEvents(await call(uniqueQuery("retrymax")));

    expect(attemptsByEngine.Hopeless).toBe(3);
    expect(events.filter((e) => e.event === "engine-retry")).toHaveLength(2);
    const result = events.find((e) => e.event === "engine-result");
    expect(result?.data.retry).toBe(false);
    expect((result?.data.results as ScoredResult[]).length).toBe(0);
  });

  test("with auto-retry off an empty engine runs exactly once", async () => {
    harness({
      engines: [emptyThenFull("Flaky", 2)],
      settings: { streamingMaxRetries: "3" },
    });
    const events = await readEvents(await call(uniqueQuery("noretry")));

    expect(attemptsByEngine.Flaky).toBe(1);
    expect(events.filter((e) => e.event === "engine-retry")).toHaveLength(0);
  });
});
