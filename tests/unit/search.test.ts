import { describe, test, expect } from "bun:test";
import { mergeNewResults, scoreResults } from "../../src/server/search";
import type { SearchResult, ScoredResult } from "../../src/server/types";

const result = (
  url: string,
  source: string,
  title = "t",
  snippet = "s",
): SearchResult => ({
  title,
  url,
  snippet,
  source,
});

const scored = (
  r: SearchResult,
  score: number,
  sources: string[],
): ScoredResult => ({ ...r, score, sources });

describe("search", () => {
  describe("mergeNewResults", () => {
    test("merges new results into existing scored list", () => {
      const existing: ScoredResult[] = [
        scored(result("https://a.com", "E1"), 10, ["E1"]),
      ];
      const newResults = [
        result("https://b.com", "E2"),
        result("https://a.com", "E2"),
      ];
      const out = mergeNewResults(existing, newResults);
      expect(out.length).toBe(2);
      const a = out.find((r) => r.url === "https://a.com");
      expect(a!.sources).toContain("E1");
      expect(a!.sources).toContain("E2");
    });

    test("prefers gif imageUrl when merging duplicates and sets isGif", () => {
      const cases: [string, string, boolean][] = [
        ["https://cdn.example.com/a.gif", "https://cdn.example.com/a.gif", true],
        ["https://cdn.example.com/a.jpg", "https://cdn.example.com/a.webp", false],
      ];

      for (const [newImageUrl, expectedUrl, expectedIsGif] of cases) {
        const existing = [
          scored(
            {
              ...result("https://a.com", "E1"),
              imageUrl: "https://cdn.example.com/a.webp",
            },
            5,
            ["E1"],
          ),
        ];
        const newResults = [
          {
            ...result("https://a.com", "E2"),
            imageUrl: newImageUrl,
          },
        ];

        const out = mergeNewResults(existing, newResults);
        expect(out[0].imageUrl).toBe(expectedUrl);
        expect(!!out[0].isGif).toBe(expectedIsGif);
      }
    });
  });

  describe("scoreResults", () => {
    test("merges results from multiple engines", () => {
      const out = scoreResults([
        { results: [result("https://a.com", "E1"), result("https://b.com", "E1")] },
        { results: [result("https://b.com", "E2"), result("https://c.com", "E2")] },
      ]);
      const b = out.find((r) => r.url === "https://b.com");
      expect(b!.sources).toContain("E1");
      expect(b!.sources).toContain("E2");
    });

    test("higher multiplier pushes engine results up", () => {
      const out = scoreResults([
        { results: [result("https://low.com", "E1")], multiplier: 1 },
        { results: [result("https://high.com", "E2")], multiplier: 5 },
      ]);
      expect(out[0].url).toBe("https://high.com");
    });

    test("equal multipliers sort by position", () => {
      const out = scoreResults([
        { results: [result("https://first.com", "E1"), result("https://second.com", "E1")] },
      ]);
      expect(out[0].url).toBe("https://first.com");
    });
  });

});
