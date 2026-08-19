import { describe, expect, test } from "bun:test";
import { mergeEngineTimings, mergeScoredResults } from "../../src/client/utils/search/engine-stats";

describe("engine stats", () => {
  test("adds successful page counts per engine", () => {
    expect(
      mergeEngineTimings(
        [{ name: "Google", time: 100, resultCount: 10, status: "ok" }],
        [{ name: "Google", time: 80, resultCount: 8, status: "ok" }],
        2,
      ),
    ).toEqual([{ name: "Google", time: 180, resultCount: 18, status: "ok" }]);
  });

  test("keeps previous count and records failed page", () => {
    expect(
      mergeEngineTimings(
        [{ name: "Google", time: 100, resultCount: 10, status: "ok" }],
        [
          {
            name: "Google",
            time: 80,
            resultCount: 0,
            status: "timeout",
            errorReason: "Engine timeout",
          },
        ],
        2,
      ),
    ).toEqual([
      {
        name: "Google",
        time: 180,
        resultCount: 10,
        status: "timeout",
        errorReason: "Engine timeout",
        httpStatus: undefined,
        failedPage: 2,
      },
    ]);
  });

  test("clears a page failure when that page is retried successfully", () => {
    expect(
      mergeEngineTimings(
        [
          {
            name: "Google",
            time: 180,
            resultCount: 10,
            status: "timeout",
            errorReason: "Engine timeout",
            failedPage: 2,
          },
        ],
        [{ name: "Google", time: 70, resultCount: 7, status: "ok" }],
        2,
      ),
    ).toEqual([
      {
        name: "Google",
        time: 250,
        resultCount: 17,
        status: "ok",
        errorReason: undefined,
        httpStatus: undefined,
        failedPage: undefined,
      },
    ]);
  });

  test("merges retried results by url", () => {
    expect(
      mergeScoredResults(
        [
          {
            title: "Old",
            url: "https://example.com",
            snippet: "Short",
            source: "Google",
            score: 1,
            sources: ["Google"],
          },
        ],
        [
          {
            title: "New",
            url: "https://example.com",
            snippet: "Longer snippet",
            source: "DuckDuckGo",
            score: 2,
            sources: ["DuckDuckGo"],
          },
        ],
      ),
    ).toEqual([
      {
        title: "New",
        url: "https://example.com",
        snippet: "Longer snippet",
        source: "DuckDuckGo",
        score: 2,
        sources: ["Google", "DuckDuckGo"],
      },
    ]);
  });
});
