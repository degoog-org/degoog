import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SearchEngine } from "../../src/server/types/extension";
import type { SearchResult } from "../../src/shared/search-types";
import { THREAT_LEVEL } from "../../src/server/utils/security/sentinel";
import { makeEngineEmitter } from "../../src/server/search/engine-emit";
import { ENGINE_TIMEOUT_REASON } from "../../src/server/search/engine-timeout";

const REGISTRY_MOD = "../../src/server/extensions/engines/catalog";
const ENGINE_CACHE_MOD = "../../src/server/search/engine-cache";
const ENGINE_TIMEOUT_MOD = "../../src/server/search/engine-timeout";

const hit = (url: string): SearchResult => ({
  title: url,
  url,
  snippet: "",
  source: "Emitter",
});

const nap = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const never = (): Promise<SearchResult[]> => new Promise(() => {});

describe("makeEngineEmitter", () => {
  test("an engine that never emits gets back exactly what it returned", async () => {
    const returned = [hit("https://a.test/"), hit("https://a.test/"), { ...hit(""), title: "no url" }];
    const { settle } = makeEngineEmitter();
    const run = await settle(Promise.resolve(returned), { idleMs: 50, budgetMs: 50, abort: () => {} });
    expect(run.results).toBe(returned);
    expect(run.partial).toBe(false);
  });

  test("an engine that never emits still times out on the idle timer", async () => {
    let aborted = false;
    const { settle } = makeEngineEmitter();
    const run = settle(never(), { idleMs: 30, budgetMs: 1000, abort: () => (aborted = true) });
    await expect(run).rejects.toThrow(ENGINE_TIMEOUT_REASON);
    expect(aborted).toBe(true);
  });

  test("each emit resets the idle timer, so a slow trickle outlives a single idle window", async () => {
    const { emit, settle } = makeEngineEmitter();
    const work = (async () => {
      for (let i = 0; i < 5; i++) {
        await nap(25);
        emit([hit(`https://trickle.test/${i}`)]);
      }
      return [];
    })();
    const run = await settle(work, { idleMs: 60, budgetMs: 1000, abort: () => {} });
    expect(run.partial).toBe(false);
    expect(run.results.map((r) => r.url)).toEqual([0, 1, 2, 3, 4].map((i) => `https://trickle.test/${i}`));
  });

  test("the overall budget stops an engine that keeps emitting, keeping what arrived", async () => {
    let aborted = false;
    let i = 0;
    const { emit, settle } = makeEngineEmitter();
    const timer = setInterval(() => emit([hit(`https://endless.test/${i++}`)]), 10);
    try {
      const run = await settle(never(), { idleMs: 40, budgetMs: 80, abort: () => (aborted = true) });
      expect(run.partial).toBe(true);
      expect(run.results.length).toBeGreaterThan(0);
      expect(aborted).toBe(true);
      const count = run.results.length;
      emit([hit("https://endless.test/late")]);
      expect(run.results.length).toBe(count);
    } finally {
      clearInterval(timer);
    }
  });

  test("emits are deduped by normalised URL and each new result reaches onPartial", async () => {
    const snapshots: string[][] = [];
    const { emit, settle } = makeEngineEmitter((results) => snapshots.push(results.map((r) => r.url)));
    const work = (async () => {
      emit([hit("https://www.dup.test/page"), hit("https://dup.test/page/")]);
      emit([hit("https://dup.test/page")]);
      emit([hit("https://dup.test/other")]);
      return [];
    })();
    const run = await settle(work, { idleMs: 50, budgetMs: 50, abort: () => {} });
    expect(snapshots).toEqual([
      ["https://www.dup.test/page"],
      ["https://www.dup.test/page", "https://dup.test/other"],
    ]);
    expect(run.results.map((r) => r.url)).toEqual(["https://www.dup.test/page", "https://dup.test/other"]);
  });

  test("onPartial carries the expected total, ignoring junk and never below what arrived", async () => {
    const seen: (number | undefined)[] = [];
    const { emit, settle } = makeEngineEmitter((_results, expected) => seen.push(expected));
    const work = (async () => {
      emit([hit("https://count.test/0")]);
      emit([hit("https://count.test/1")], { expected: -4 });
      emit([hit("https://count.test/2")], { expected: 5 });
      emit([hit("https://count.test/3")], { expected: 2 });
      emit([hit("https://count.test/4"), hit("https://count.test/5")]);
      return [];
    })();
    await settle(work, { idleMs: 50, budgetMs: 50, abort: () => {} });
    expect(seen).toEqual([undefined, undefined, 5, 5, 6]);
  });

  test("a returned list sets the final order and emitted extras are appended", async () => {
    const { emit, settle } = makeEngineEmitter();
    const work = (async () => {
      emit([hit("https://order.test/3"), hit("https://order.test/1"), hit("https://order.test/9")]);
      return [hit("https://order.test/1"), hit("https://order.test/2"), hit("https://order.test/3")];
    })();
    const run = await settle(work, { idleMs: 50, budgetMs: 50, abort: () => {} });
    expect(run.results.map((r) => r.url)).toEqual([
      "https://order.test/1",
      "https://order.test/2",
      "https://order.test/3",
      "https://order.test/9",
    ]);
  });

  test("an engine that throws after emitting keeps its emitted results", async () => {
    const { emit, settle } = makeEngineEmitter();
    const work = (async () => {
      emit([hit("https://throws.test/a")]);
      await nap(5);
      throw new Error("resolver fell over");
    })();
    const run = await settle(work, { idleMs: 50, budgetMs: 50, abort: () => {} });
    expect(run.partial).toBe(true);
    expect(run.results.map((r) => r.url)).toEqual(["https://throws.test/a"]);
    expect((run.error as Error).message).toBe("resolver fell over");
  });
});

const registryReal = { ...(await import(REGISTRY_MOD)) };
const engineCacheReal = { ...(await import(ENGINE_CACHE_MOD)) };
const engineTimeoutReal = { ...(await import(ENGINE_TIMEOUT_MOD)) };

let behaviour: "finish" | "stall" | "trickle" = "finish";

const engine: SearchEngine = {
  name: "Emitting Engine",
  executeSearch: async (_query, _page, _time, context) => {
    if (behaviour === "trickle") {
      for (let i = 0; !context?.signal?.aborted; i++) {
        context?.emit?.([hit(`https://trickle.test/${i}`)]);
        await nap(10);
      }
      return [];
    }
    context?.emit?.([hit("https://emit.test/b"), hit("https://emit.test/a")]);
    if (behaviour === "stall") return never();
    return [hit("https://emit.test/a"), hit("https://emit.test/b")];
  },
};

let saved = 0;
let searchSingleEngine: typeof import("../../src/server/search").searchSingleEngine;

describe("searchSingleEngine with an emitting engine", () => {
  beforeAll(async () => {
    mock.module(REGISTRY_MOD, () => ({
      ...registryReal,
      getEngineMap: () => ({ emitting: engine }),
      getEngineIdByInstance: () => undefined,
    }));
    mock.module(ENGINE_CACHE_MOD, () => ({
      ...engineCacheReal,
      isCacheable: () => true,
      runKey: async () => "emitting-key",
      readRun: async () => null,
      saveRun: async () => {
        saved += 1;
      },
    }));
    mock.module(ENGINE_TIMEOUT_MOD, () => ({
      ...engineTimeoutReal,
      getEngineTimeout: async () => 40,
    }));
    searchSingleEngine = (await import("../../src/server/search")).searchSingleEngine;
  });

  afterAll(() => {
    mock.module(REGISTRY_MOD, () => registryReal);
    mock.module(ENGINE_CACHE_MOD, () => engineCacheReal);
    mock.module(ENGINE_TIMEOUT_MOD, () => engineTimeoutReal);
  });

  test("a run that finishes is cached in the engine's own order", async () => {
    behaviour = "finish";
    saved = 0;
    const run = await searchSingleEngine("emitting", "hello");
    expect(run.results.map((r) => r.url)).toEqual(["https://emit.test/a", "https://emit.test/b"]);
    expect(run.timing.status).toBe(THREAT_LEVEL.OK);
    expect(saved).toBe(1);
  });

  test("a run cut off by the timer returns what was emitted and is not cached", async () => {
    behaviour = "stall";
    saved = 0;
    const partials: number[] = [];
    const run = await searchSingleEngine(
      "emitting", "hello", 1, "any", undefined, undefined, undefined, undefined, undefined, undefined,
      { onPartial: (results) => partials.push(results.length) },
    );
    expect(run.results.map((r) => r.url)).toEqual(["https://emit.test/b", "https://emit.test/a"]);
    expect(run.timing.status).toBe(THREAT_LEVEL.OK);
    expect(run.timing.resultCount).toBe(2);
    expect(partials).toEqual([2]);
    expect(saved).toBe(0);
  });

  test("without a stream an emitting engine is cut at its normal timeout, with one it gets the full budget", async () => {
    behaviour = "trickle";
    const plain = await searchSingleEngine("emitting", "plain");
    const streamed = await searchSingleEngine(
      "emitting", "streamed", 1, "any", undefined, undefined, undefined, undefined, undefined, undefined,
      { onPartial: () => {} },
    );
    expect(plain.timing.time).toBeLessThan(80);
    expect(plain.results.length).toBeGreaterThan(0);
    expect(streamed.timing.time).toBeGreaterThanOrEqual(110);
  });
});
