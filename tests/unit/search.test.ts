import { describe, test, expect } from "bun:test";
import { mergeNewResults, resolveEngine, scoreResults } from "../../src/server/search";
import { cacheKey } from "../../src/server/utils/search";
import {
  ImgNsfw,
  type SearchResult,
  type ScoredResult,
  type EngineConfig,
} from "../../src/server/types";

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

    test("returns sorted by score", () => {
      const existing = [scored(result("https://a.com", "E1"), 5, ["E1"])];
      const newResults = [result("https://a.com", "E2")];
      const out = mergeNewResults(existing, newResults);
      expect(out[0].url).toBe("https://a.com");
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

  describe("cacheKey", () => {
    const engines: EngineConfig = { google: true };

    test("differs when only imgNsfw differs", () => {
      const safe = cacheKey("cats", engines, "images", 1, "any", "", "", "", {
        nsfw: ImgNsfw.OFF,
      });
      const nsfw = cacheKey("cats", engines, "images", 1, "any", "", "", "", {
        nsfw: ImgNsfw.ON,
      });
      expect(safe).not.toBe(nsfw);
    });

    test("stays stable when imageFilter is absent", () => {
      const a = cacheKey("cats", engines, "web", 1);
      const b = cacheKey("cats", engines, "web", 1);
      expect(a).toBe(b);
      expect(a.endsWith("|")).toBe(true);
    });
  });

  describe("resolveEngine", () => {
    test("returns null for unknown engine name", async () => {
      const { initEngines } =
        await import("../../src/server/extensions/engines/registry");
      const orig = process.env.DEGOOG_ENGINES_DIR;
      process.env.DEGOOG_ENGINES_DIR = "/nonexistent-empty-dir-12345";
      await initEngines();
      expect(resolveEngine("nonexistent-engine-xyz")).toBeNull();
      if (orig !== undefined) process.env.DEGOOG_ENGINES_DIR = orig;
      else delete process.env.DEGOOG_ENGINES_DIR;
    });
  });
});
