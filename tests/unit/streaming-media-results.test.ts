import { describe, test, expect } from "bun:test";
import type { ScoredResult } from "../../src/server/types";
import { mergeStreamingMediaResults } from "../../src/client/utils/search/streaming-media-results";

const image = (url: string, score: number, source = "engine"): ScoredResult => ({
  title: url,
  url,
  snippet: "",
  source,
  score,
  sources: [source],
});

describe("streaming media result merging", () => {
  test("uses the latest scored stream order instead of first-arrival append order", () => {
    const firstArrival = [image("https://bing.example/1", 10, "Bing")];
    const latestScored = [
      image("https://google.example/1", 40, "Google Images"),
      image("https://bing.example/1", 10, "Bing"),
    ];

    const out = mergeStreamingMediaResults(firstArrival, latestScored);

    expect(out.map((r) => r.url)).toEqual([
      "https://google.example/1",
      "https://bing.example/1",
    ]);
  });

  test("returns empty array when latestScored is empty, ignoring current results", () => {
    const current = [image("https://bing.example/1", 10, "Bing")];
    const out = mergeStreamingMediaResults(current, []);
    expect(out).toEqual([]);
  });

  test("returns latestScored unchanged when current is empty", () => {
    const latestScored = [
      image("https://google.example/1", 40, "Google Images"),
    ];
    const out = mergeStreamingMediaResults([], latestScored);
    expect(out).toEqual(latestScored);
  });

  test("returns empty array when both inputs are empty", () => {
    const out = mergeStreamingMediaResults([], []);
    expect(out).toEqual([]);
  });

  test("completely ignores current results - does not merge or intersect", () => {
    const current = [
      image("https://exclusive-to-current.example/1", 99, "EngineA"),
      image("https://shared.example/1", 50, "EngineA"),
    ];
    const latestScored = [
      image("https://shared.example/1", 50, "EngineB"),
      image("https://exclusive-to-latest.example/1", 30, "EngineB"),
    ];

    const out = mergeStreamingMediaResults(current, latestScored);

    // current-only URL is absent in output
    expect(out.map((r) => r.url)).not.toContain("https://exclusive-to-current.example/1");
    // latestScored URLs are present
    expect(out.map((r) => r.url)).toContain("https://shared.example/1");
    expect(out.map((r) => r.url)).toContain("https://exclusive-to-latest.example/1");
  });

  test("preserves full result objects from latestScored", () => {
    const latestScored = [
      image("https://example.com/img1", 55, "MyEngine"),
    ];
    const out = mergeStreamingMediaResults([], latestScored);
    expect(out[0]).toEqual(latestScored[0]);
    expect(out[0]!.score).toBe(55);
    expect(out[0]!.source).toBe("MyEngine");
  });

  test("preserves order from latestScored exactly", () => {
    const latestScored = [
      image("https://a.example/1", 30, "E1"),
      image("https://b.example/1", 20, "E2"),
      image("https://c.example/1", 10, "E3"),
    ];
    const out = mergeStreamingMediaResults(
      [image("https://z.example/1", 100, "E4")],
      latestScored,
    );
    expect(out.map((r) => r.url)).toEqual([
      "https://a.example/1",
      "https://b.example/1",
      "https://c.example/1",
    ]);
  });

  test("returns the exact latestScored reference contents (not a copy of current)", () => {
    const current = [image("https://old.example/1", 100, "OldEngine")];
    const latestScored = [image("https://new.example/1", 5, "NewEngine")];
    const out = mergeStreamingMediaResults(current, latestScored);

    expect(out.length).toBe(1);
    expect(out[0]!.url).toBe("https://new.example/1");
    expect(out[0]!.source).toBe("NewEngine");
  });
});
