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
});
