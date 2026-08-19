import { beforeEach, describe, expect, test } from "bun:test";
import { readRun } from "../../src/server/search/engine-cache";
import {
  clear,
  engineRunCache,
  type CachedEngineRun,
} from "../../src/server/utils/cache";
import { THREAT_LEVEL } from "../../src/server/utils/sentinel";

const store = (key: string, value: unknown): Promise<void> =>
  engineRunCache.set(key, value as CachedEngineRun);

describe("engine-cache readRun", () => {
  beforeEach(async () => {
    await clear();
  });

  test("returns a valid cached run untouched", async () => {
    const run: CachedEngineRun = {
      results: [],
      timing: {
        name: "Brave",
        time: 12,
        resultCount: 0,
        status: THREAT_LEVEL.OK,
      },
      pages: 3,
    };
    await store("good", run);
    expect(await readRun("good")).toEqual(run);
  });

  test("returns null for a missing key", async () => {
    expect(await readRun("nothing")).toBe(null);
  });

  test("drops entries that are not engine runs", async () => {
    await store("legacy", { results: [], engineTimings: [] });
    await store("scalar", "just a string");
    await store("noTiming", { results: [] });
    await store("badResults", { results: {}, timing: { name: "x", time: 1, resultCount: 0 } });
    await store("halfTiming", { results: [], timing: { name: "x" } });

    expect(await readRun("legacy")).toBe(null);
    expect(await readRun("scalar")).toBe(null);
    expect(await readRun("noTiming")).toBe(null);
    expect(await readRun("badResults")).toBe(null);
    expect(await readRun("halfTiming")).toBe(null);
  });
});
