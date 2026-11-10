import { describe, expect, test } from "bun:test";
import {
  averageCardHeight,
  keepPlacedOrder,
  shortestColumn,
} from "../../../src/client/modules/renderer/media/image-columns";
import type { ScoredResult } from "../../../src/shared/search-types";

const result = (url: string, sources: string[] = ["A"]): ScoredResult => ({
  title: url,
  url,
  snippet: "",
  source: sources[0],
  score: 1,
  sources,
});

const urls = (results: ScoredResult[]): string[] => results.map((r) => r.url);

describe("keepPlacedOrder", () => {
  test("keeps cards a visitor has seen where they are when a later engine re-ranks them", () => {
    const placed = [result("a"), result("b")];
    const batch = [result("c"), result("b"), result("d"), result("a")];
    expect(urls(keepPlacedOrder(placed, batch))).toEqual(["a", "b", "c", "d"]);
  });

  test("refreshes placed results with the merged copy from the newest batch", () => {
    const merged = result("a", ["A", "B"]);
    const next = keepPlacedOrder([result("a")], [result("b"), merged]);
    expect(next[0]).toBe(merged);
  });

  test("keeps a placed result the batch no longer carries", () => {
    expect(urls(keepPlacedOrder([result("gone")], [result("b")]))).toEqual(["gone", "b"]);
  });

  test("ranks everything by the batch when nothing has been placed", () => {
    const batch = [result("c"), result("a")];
    expect(urls(keepPlacedOrder([], batch))).toEqual(["c", "a"]);
  });
});

describe("shortestColumn", () => {
  test("picks the lowest column and breaks ties on fewer cards", () => {
    expect(
      shortestColumn([
        { height: 2, cards: 1 },
        { height: 1, cards: 3 },
        { height: 1, cards: 2 },
      ]),
    ).toBe(2);
  });
});

describe("averageCardHeight", () => {
  test("falls back to a square card before anything is measured", () => {
    expect(averageCardHeight([{ height: 0, cards: 0 }])).toBe(1);
  });
});
