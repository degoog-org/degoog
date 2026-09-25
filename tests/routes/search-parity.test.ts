import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SearchEngine } from "../../src/server/types/extension";
import type { ScoredResult, SearchResult } from "../../src/shared/search-types";

const { initServerKey } = await import("../../src/server/utils/security/server-key");
await initServerKey();

const ENGINES_MOD = "../../src/server/extensions/engines/catalog";
const ENGINE_SETTINGS_MOD = "../../src/server/extensions/engines/engine-settings";
const SERVER_SETTINGS_MOD = "../../src/server/utils/settings/server-settings";
const PLUGIN_SETTINGS_MOD = "../../src/server/utils/settings/plugin-settings";
const INTERCEPTS_MOD = "../../src/server/utils/extension-support/run-interceptors";

const enginesReal = { ...(await import(ENGINES_MOD)) };
const engineSettingsReal = { ...(await import(ENGINE_SETTINGS_MOD)) };
const serverSettingsReal = { ...(await import(SERVER_SETTINGS_MOD)) };
const pluginSettingsReal = { ...(await import(PLUGIN_SETTINGS_MOD)) };
const interceptsReal = { ...(await import(INTERCEPTS_MOD)) };

const { DEGOOG_ENGINE_NAME } = await import("../../src/shared/search-types");

type EngineEntry = { id: string; instance: SearchEngine; score: number };
type SseEvent = { event: string; data: Record<string, unknown> };

let queryCounter = 0;
const uniqueQuery = (label: string): string => `parity-${label}-${++queryCounter}`;

const engine = (
  name: string,
  score: number,
  results: SearchResult[],
  pages?: number,
): EngineEntry => ({
  id: `${name.toLowerCase()}-engine`,
  score,
  instance: {
    name,
    executeSearch: async (_query, _page, _timeFilter, context) => {
      if (pages !== undefined) context?.pagination?.({ total: pages });
      return results;
    },
  },
});

const result = (source: string, url: string, extra: Partial<SearchResult> = {}): SearchResult => ({
  title: `${source} ${url}`,
  url,
  snippet: `${source} snippet`,
  source,
  ...extra,
});

const harness = (engines: EngineEntry[]): void => {
  const active = engines.map(({ id, instance, score }) => ({ id, instance, score }));
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
    getInstanceSettings: async () => ({}),
  }));
  mock.module(PLUGIN_SETTINGS_MOD, () => ({
    ...pluginSettingsReal,
    getSettings: async () => ({}),
  }));
  mock.module(INTERCEPTS_MOD, () => ({
    ...interceptsReal,
    runIntercepts: async (query: string) => ({ query, overrides: {} }),
  }));
};

afterEach(() => {
  mock.module(ENGINES_MOD, () => enginesReal);
  mock.module(ENGINE_SETTINGS_MOD, () => engineSettingsReal);
  mock.module(SERVER_SETTINGS_MOD, () => serverSettingsReal);
  mock.module(PLUGIN_SETTINGS_MOD, () => pluginSettingsReal);
  mock.module(INTERCEPTS_MOD, () => interceptsReal);
});

const readEvents = async (res: Response): Promise<SseEvent[]> =>
  (await res.text())
    .split("\n\n")
    .filter((chunk) => chunk.trim().length > 0)
    .map((chunk) => ({
      event: /^event: (.+)$/m.exec(chunk)?.[1] ?? "",
      data: JSON.parse(/^data: (.+)$/m.exec(chunk)?.[1] ?? "{}") as Record<string, unknown>,
    }));

type Outcome = {
  engines: string[];
  results: ScoredResult[];
  totalPages: unknown;
};

const viaStream = async (qs: string): Promise<Outcome> => {
  const router = (await import("../../src/server/routes/search/stream")).default;
  const events = await readEvents(
    await router.request(new Request(`http://localhost/api/search/stream?${qs}`)),
  );
  const done = events.find((e) => e.event === "done")!.data;
  const lastResult = events.filter((e) => e.event === "engine-result").at(-1)!.data;
  return {
    engines: (done.engineTimings as { name: string }[]).map((t) => t.name).sort(),
    results: lastResult.results as ScoredResult[],
    totalPages: done.totalPages,
  };
};

const viaJson = async (qs: string): Promise<Outcome> => {
  const router = (await import("../../src/server/routes/search/index")).default;
  const body = (await (
    await router.request(new Request(`http://localhost/api/search?${qs}`))
  ).json()) as {
    engineTimings: { name: string }[];
    results: (ScoredResult & { content?: string })[];
    totalPages?: number;
  };
  return {
    engines: body.engineTimings.map((t) => t.name).sort(),
    results: body.results.map(({ content: _content, ...r }) => r),
    totalPages: body.totalPages,
  };
};

const shape = (results: ScoredResult[]) =>
  results.map((r) => ({
    url: r.url,
    score: r.score,
    sources: r.sources,
    thumbnail: r.thumbnail,
    imageUrl: r.imageUrl,
    idx: (r as { idx?: string }).idx,
  }));

const overlapping = (): EngineEntry[] => [
  engine(
    "Alpha",
    1,
    [
      result("Alpha", "https://a.test/1", { thumbnail: "https://img.test/a1.png" }),
      result("Alpha", "https://shared.test/x"),
      result("Alpha", "https://a.test/3"),
    ],
    5,
  ),
  engine(
    "Beta",
    2,
    [
      result("Beta", "https://shared.test/x", { thumbnail: "https://img.test/shared.png" }),
      result("Beta", "https://b.test/2", { imageUrl: "https://img.test/b2-full.png" }),
    ],
    7,
  ),
  engine(DEGOOG_ENGINE_NAME, 0.5, [result(DEGOOG_ENGINE_NAME, "https://recalled.test/r")], 3),
];

describe("page one over SSE and later pages over JSON agree", () => {
  test("same engine set, result order, scores, page total and signed thumbnails", async () => {
    harness(overlapping());
    const qs = `q=${encodeURIComponent(uniqueQuery("page1"))}`;
    const stream = await viaStream(qs);
    const json = await viaJson(qs);

    expect(stream.engines).toEqual(["Alpha", "Beta", DEGOOG_ENGINE_NAME].sort());
    expect(json.engines).toEqual(stream.engines);
    expect(stream.results.map((r) => r.score)).toEqual([34, 18, 10, 8, 5]);
    expect(shape(json.results)).toEqual(shape(stream.results));
    expect(json.totalPages).toBe(7);
    expect(stream.totalPages).toBe(json.totalPages);
    expect(stream.results.find((r) => r.url === "https://a.test/1")?.thumbnail).toContain(
      "/api/proxy/image?url=",
    );
    expect(
      stream.results.find((r) => r.url === "https://recalled.test/r"),
    ).toMatchObject({ idx: "recalled" });
  });

  test("a later page gives the same answer through both paths", async () => {
    harness(overlapping());
    const qs = `q=${encodeURIComponent(uniqueQuery("page2"))}&page=2`;
    const stream = await viaStream(qs);
    const json = await viaJson(qs);

    expect(json.engines).toEqual(stream.engines);
    expect(shape(json.results)).toEqual(shape(stream.results));
    expect(stream.totalPages).toBe(json.totalPages);
  });

  test("an engine that declares no page total leaves both totals undefined", async () => {
    harness([
      engine("Alpha", 1, [result("Alpha", "https://a.test/1")], 4),
      engine("Beta", 2, [result("Beta", "https://b.test/1")]),
    ]);
    const qs = `q=${encodeURIComponent(uniqueQuery("nototal"))}`;
    const stream = await viaStream(qs);
    const json = await viaJson(qs);

    expect(stream.totalPages).toBeUndefined();
    expect(json.totalPages).toBeUndefined();
    expect(shape(json.results)).toEqual(shape(stream.results));
  });
});
