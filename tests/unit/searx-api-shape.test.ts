import { describe, test, expect } from "bun:test";
import {
  isSearxFormat,
  toSearxDoc,
} from "../../src/server/extensions/compatibility-layer/searx/api-shape";
import { THREAT_LEVEL } from "../../src/server/utils/sentinel";
import type { ScoredResult } from "../../src/shared/search-types";

const result = (over: Partial<ScoredResult> = {}): ScoredResult => ({
  title: "Rust lifetimes",
  url: "https://doc.rust-lang.org/book/ch10-03.html?x=1#anchor",
  snippet: "A lifetime is...",
  source: "Brave",
  score: 92,
  sources: ["Brave", "DuckDuckGo"],
  ...over,
});

const base = {
  query: "rust lifetimes",
  type: "web",
  relatedSearches: ["rust lifetime elision"],
  engineTimings: [],
};

describe("isSearxFormat", () => {
  test("accepts the json format value regardless of case and padding", () => {
    expect(isSearxFormat("json")).toBe(true);
    expect(isSearxFormat(" JSON ")).toBe(true);
  });

  test("rejects everything else", () => {
    expect(isSearxFormat("searx")).toBe(false);
    expect(isSearxFormat("rss")).toBe(false);
    expect(isSearxFormat("csv")).toBe(false);
    expect(isSearxFormat("")).toBe(false);
    expect(isSearxFormat(null)).toBe(false);
    expect(isSearxFormat(undefined)).toBe(false);
  });
});

describe("toSearxDoc", () => {
  test("emits exactly the SearXNG top-level keys", async () => {
    const doc = await toSearxDoc({ ...base, results: [result()] });
    expect(Object.keys(doc).sort()).toEqual([
      "answers",
      "corrections",
      "infoboxes",
      "query",
      "results",
      "suggestions",
      "unresponsive_engines",
    ]);
  });

  test("renames snippet to content and source to engine", async () => {
    const doc = await toSearxDoc({ ...base, results: [result()] });
    const r = doc.results[0]!;
    expect(r.content).toBe("A lifetime is...");
    expect(r.engine).toBe("brave");
    expect(r.engines).toEqual(["brave", "duckduckgo"]);
    expect(r).not.toHaveProperty("snippet");
    expect(r).not.toHaveProperty("source");
  });

  test("maps degoog web type to the general category", async () => {
    const doc = await toSearxDoc({ ...base, results: [result()] });
    expect(doc.results[0]!.category).toBe("general");
    expect(doc.results[0]!.template).toBe("default.html");
  });

  test("maps media types to their category and template", async () => {
    const imgs = await toSearxDoc({ ...base, type: "images", results: [result()] });
    expect(imgs.results[0]!.category).toBe("images");
    expect(imgs.results[0]!.template).toBe("images.html");

    const vids = await toSearxDoc({ ...base, type: "videos", results: [result()] });
    expect(vids.results[0]!.template).toBe("videos.html");
  });

  test("falls back to general for unknown custom tab types", async () => {
    const doc = await toSearxDoc({ ...base, type: "recipes", results: [result()] });
    expect(doc.results[0]!.category).toBe("general");
  });

  test("splits parsed_url into the urlparse six-tuple", async () => {
    const doc = await toSearxDoc({ ...base, results: [result()] });
    expect(doc.results[0]!.parsed_url).toEqual([
      "https",
      "doc.rust-lang.org",
      "/book/ch10-03.html",
      "",
      "x=1",
      "anchor",
    ]);
  });

  test("survives a malformed result url without throwing", async () => {
    const doc = await toSearxDoc({ ...base, results: [result({ url: "not a url" })] });
    expect(doc.results[0]!.parsed_url).toEqual(["", "", "not a url", "", "", ""]);
  });

  test("numbers positions from one", async () => {
    const doc = await toSearxDoc({
      ...base,
      results: [result(), result({ url: "https://b.example/" })],
    });
    expect(doc.results[0]!.positions).toEqual([1]);
    expect(doc.results[1]!.positions).toEqual([2]);
  });

  test("carries media fields across and defaults the rest to empty", async () => {
    const doc = await toSearxDoc({
      ...base,
      results: [result({ imageUrl: "https://i/x.png", thumbnail: "https://i/t.png", duration: "3:21" })],
    });
    const r = doc.results[0]!;
    expect(r.img_src).toBe("https://i/x.png");
    expect(r.thumbnail).toBe("https://i/t.png");
    expect(r.length).toBe("3:21");
    expect(r.author).toBe("");
    expect(r.publishedDate).toBeNull();
  });

  test("maps related searches onto suggestions", async () => {
    const doc = await toSearxDoc({ ...base, results: [] });
    expect(doc.suggestions).toEqual(["rust lifetime elision"]);
  });

  test("reports failed engines as sorted name and reason pairs", async () => {
    const doc = await toSearxDoc({
      ...base,
      results: [],
      engineTimings: [
        { name: "Zoo", time: 1, resultCount: 0, status: THREAT_LEVEL.TIMEOUT },
        { name: "Brave", time: 2, resultCount: 5, status: THREAT_LEVEL.OK },
        { name: "Ape", time: 3, resultCount: 0, status: THREAT_LEVEL.RATE_LIMITED },
      ],
    });
    expect(doc.unresponsive_engines).toEqual([
      ["ape", "Too many requests"],
      ["zoo", "Timeout"],
    ]);
  });

  test("omits engines that succeeded or reported no status", async () => {
    const doc = await toSearxDoc({
      ...base,
      results: [],
      engineTimings: [
        { name: "Brave", time: 2, resultCount: 5, status: THREAT_LEVEL.OK },
        { name: "Mojeek", time: 2, resultCount: 5 },
      ],
    });
    expect(doc.unresponsive_engines).toEqual([]);
  });

  test("tolerates a retry payload with no query or type", async () => {
    const doc = await toSearxDoc({ results: [result()], engineTimings: [] });
    expect(doc.query).toBe("");
    expect(doc.results[0]!.category).toBe("general");
  });
});
