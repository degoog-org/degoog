import { describe, test, expect } from "bun:test";
import {
  isPublishDate,
  snippetDate,
  stripSnippetPrefix,
} from "../../../src/server/utils/text";
import { scoreResults } from "../../../src/server/search/scoring";
import type { SearchResult } from "../../../src/shared/search-types";

const BODY = "A perfectly ordinary snippet about nothing in particular.";

const result = (snippet: string, source = "E1"): SearchResult => ({
  title: "t",
  url: "https://example.com/a",
  snippet,
  source,
});

describe("snippetDate", () => {
  test("reads an ISO prefix", () => {
    expect(snippetDate(`2024-01-12 - ${BODY}`)).toEqual({
      iso: "2024-01-12",
      rest: BODY,
    });
  });

  test("reads month-first and day-first prefixes", () => {
    for (const [prefix, iso] of [
      ["Jan 12, 2024 - ", "2024-01-12"],
      ["January 12, 2024 · ", "2024-01-12"],
      ["12 January 2024 - ", "2024-01-12"],
      ["3 Feb. 2020 – ", "2020-02-03"],
    ]) {
      expect(snippetDate(`${prefix}${BODY}`)?.iso).toBe(iso);
    }
  });

  test("resolves a relative prefix against now", () => {
    const expected = new Date(Date.now() - 3 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(snippetDate(`3 days ago - ${BODY}`)?.iso).toBe(expected);
  });

  test("rejects impossible, ambiguous, unseparated and off-start dates", () => {
    for (const snippet of [
      `2024-02-31 - ${BODY}`,
      `Feb 30, 2024 - ${BODY}`,
      `2024-01-12 ${BODY}`,
      "2024-01-12 - ",
      `01/12/2024 - ${BODY}`,
      `Filmed on 2024-01-12 - ${BODY}`,
    ]) {
      expect(snippetDate(snippet)).toBeNull();
    }
  });

  test("stripSnippetPrefix still drops the whole prefix", () => {
    expect(stripSnippetPrefix(`2024-01-12 - ${BODY}`)).toBe(BODY);
  });
});

describe("isPublishDate", () => {
  test("accepts a plausible date", () => {
    expect(isPublishDate("2024-01-12")).toBe(true);
    expect(isPublishDate(new Date().toISOString().slice(0, 10))).toBe(true);
  });

  test("rejects epoch sentinels, future days and anything not a plain ISO day", () => {
    for (const day of [
      "1970-01-01",
      "1970-01-02",
      "1989-12-31",
      new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      "",
      "2024-1-2",
      "2024-01-12T00:00:00Z",
      "2024-02-31",
    ]) {
      expect(isPublishDate(day)).toBe(false);
    }
  });
});

describe("scoreResults publication dates", () => {
  test("lifts the date out of the snippet", () => {
    const [merged] = scoreResults([
      { results: [result(`2024-01-12 - ${BODY}`)] },
    ]);
    expect(merged.publishedAt).toBe("2024-01-12");
    expect(merged.snippet).toBe(BODY);
  });

  test("keeps a date the engine supplied itself", () => {
    const [merged] = scoreResults([
      {
        results: [{ ...result(`2024-01-12 - ${BODY}`), publishedAt: "2019-07-01" }],
      },
    ]);
    expect(merged.publishedAt).toBe("2019-07-01");
    expect(merged.snippet).toBe(`2024-01-12 - ${BODY}`);
  });

  test("drops an epoch date an engine handed over", () => {
    const [merged] = scoreResults([
      { results: [{ ...result(BODY), publishedAt: "1970-01-01" }] },
    ]);
    expect(merged.publishedAt).toBeUndefined();
    expect(merged.snippet).toBe(BODY);
  });

  test("falls back to the snippet when the engine date is junk", () => {
    const [merged] = scoreResults([
      {
        results: [
          { ...result(`2024-01-12 - ${BODY}`), publishedAt: "1970-01-01" },
        ],
      },
    ]);
    expect(merged.publishedAt).toBe("2024-01-12");
    expect(merged.snippet).toBe(BODY);
  });

  test("takes a date from a duplicate when the first engine had none", () => {
    const [merged] = scoreResults([
      { results: [result(BODY, "E1")] },
      { results: [result(`2024-01-12 - ${BODY} And then some more.`, "E2")] },
    ]);
    expect(merged.publishedAt).toBe("2024-01-12");
    expect(merged.sources).toEqual(["E1", "E2"]);
  });
});
