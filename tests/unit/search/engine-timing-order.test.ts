import { describe, expect, test } from "bun:test";
import { compareEngineTimings, type EngineTiming } from "../../../src/shared/search-types";

describe("compareEngineTimings", () => {
  test("engines still emitting sit below answered engines and above failed ones", () => {
    const timings: (EngineTiming & { emitting?: { count: number } })[] = [
      { name: "Blocked", time: 5, resultCount: 0, status: "blocked" },
      { name: "Google", time: 0, resultCount: 3, emitting: { count: 3 } },
      { name: "Slow", time: 900, resultCount: 10 },
      { name: "Fast", time: 200, resultCount: 10 },
    ];
    expect([...timings].sort(compareEngineTimings).map((t) => t.name)).toEqual([
      "Fast",
      "Slow",
      "Google",
      "Blocked",
    ]);
  });
});
