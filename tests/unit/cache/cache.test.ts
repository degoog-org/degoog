import { beforeEach, describe, expect, test } from "bun:test";
import {
  clear,
  engineErrored,
  engineRunCache,
  type CachedEngineRun,
} from "../../../src/server/utils/cache/cache";

const mockRun = (
  resultCount: number,
  status?: string,
): CachedEngineRun => ({
  results: [],
  timing: { name: "e", time: 0, resultCount, status },
});

describe("cache", () => {
  beforeEach(async () => {
    await clear();
  });

  describe("engineRunCache", () => {
    test("returns null for missing key", async () => {
      expect(await engineRunCache.get("missing")).toBe(null);
    });

    test("returns value after set", async () => {
      const run = mockRun(5, "ok");
      await engineRunCache.set("k1", run);
      expect(await engineRunCache.get("k1")).toEqual(run);
    });

    test("clear removes all entries", async () => {
      await engineRunCache.set("k1", mockRun(1, "ok"));
      await clear();
      expect(await engineRunCache.get("k1")).toBe(null);
    });

    test("returns null after TTL expires", async () => {
      const run = mockRun(1, "ok");
      await engineRunCache.set("k1", run, 50);
      expect(await engineRunCache.get("k1")).toEqual(run);
      await Bun.sleep(60);
      expect(await engineRunCache.get("k1")).toBe(null);
    });

    test("keeps engine entries independent of each other", async () => {
      await engineRunCache.set("bing|cats", mockRun(8, "ok"));
      await engineRunCache.set("google|cats", mockRun(0, "blocked"));
      expect((await engineRunCache.get("bing|cats"))?.timing.resultCount).toBe(8);
    });

    test("replays a declared page total on a cache hit", async () => {
      await engineRunCache.set("jellyfin|cats", {
        ...mockRun(8, "ok"),
        pages: 12,
      });
      await engineRunCache.set("bing|cats", mockRun(8, "ok"));
      expect((await engineRunCache.get("jellyfin|cats"))?.pages).toBe(12);
      expect((await engineRunCache.get("bing|cats"))?.pages).toBeUndefined();
    });
  });

  describe("engineErrored", () => {
    test("only threat statuses count as errored, undefined stays ok", () => {
      expect(engineErrored("timeout")).toBe(true);
      expect(engineErrored("blocked")).toBe(true);
      expect(engineErrored("ok")).toBe(false);
      expect(engineErrored(undefined)).toBe(false);
    });
  });
});
