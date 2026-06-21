import { describe, test, expect } from "bun:test";
import { shouldIndex } from "../../src/server/indexer/filters";
import type { IndexerConfig } from "../../src/server/indexer/types/config";
import type { SearchResult } from "../../src/server/types";

const baseCfg: IndexerConfig = {
  maxPerSearch: 30,
  maxUrls: 0,
  maxHits: 0,
  fuzzyMinTermRatio: 0.6,
  pruneEnabled: false,
  fuzzyEnabled: true,
  queryLimit: 30,
  domainAllowlist: new Set<string>(),
  maxAgeDays: 0,
  domainBlocklist: new Set<string>(),
  wordBlocklist: [],
};

const result = (over: Partial<SearchResult> = {}): SearchResult => ({
  title: "Example title",
  url: "https://www.example.com/page",
  snippet: "a snippet",
  source: "TestEngine",
  ...over,
});

describe("indexer filters - shouldIndex", () => {
  test("empty config indexes everything", () => {
    expect(shouldIndex(result(), baseCfg)).toBe(true);
  });

  test("domain blocklist rejects matching host and subdomains", () => {
    const cfg = { ...baseCfg, domainBlocklist: new Set(["example.com"]) };
    expect(shouldIndex(result({ url: "https://example.com/a" }), cfg)).toBe(false);
    expect(shouldIndex(result({ url: "https://www.example.com/a" }), cfg)).toBe(false);
    expect(shouldIndex(result({ url: "https://deep.nested.example.com/a" }), cfg)).toBe(false);
    expect(shouldIndex(result({ url: "https://other.org/a" }), cfg)).toBe(true);
    expect(shouldIndex(result({ url: "https://notexample.com/a" }), cfg)).toBe(true);
  });

  test("domain blocklist stays fast with a large list", () => {
    const big = new Set<string>();
    for (let i = 0; i < 5_000; i++) big.add(`blocked-${i}.com`);
    big.add("example.com");
    const cfg = { ...baseCfg, domainBlocklist: big };
    expect(shouldIndex(result({ url: "https://www.example.com/a" }), cfg)).toBe(false);
    expect(shouldIndex(result({ url: "https://allowed.org/a" }), cfg)).toBe(true);
  });

  test("domain allowlist only indexes listed domains when non-empty", () => {
    const cfg = { ...baseCfg, domainAllowlist: new Set(["example.com"]) };
    expect(shouldIndex(result({ url: "https://sub.example.com/a" }), cfg)).toBe(true);
    expect(shouldIndex(result({ url: "https://elsewhere.net/a" }), cfg)).toBe(false);
  });

  test("blocklist wins over allowlist", () => {
    const cfg = {
      ...baseCfg,
      domainAllowlist: new Set(["example.com"]),
      domainBlocklist: new Set(["example.com"]),
    };
    expect(shouldIndex(result({ url: "https://example.com/a" }), cfg)).toBe(false);
  });

  test("word blocklist rejects matches in title, snippet, or url", () => {
    const cfg = { ...baseCfg, wordBlocklist: ["casino"] };
    expect(shouldIndex(result({ title: "Best CASINO ever" }), cfg)).toBe(false);
    expect(shouldIndex(result({ snippet: "win at the casino" }), cfg)).toBe(false);
    expect(shouldIndex(result({ url: "https://example.com/casino" }), cfg)).toBe(false);
    expect(shouldIndex(result(), cfg)).toBe(true);
  });

  test("malformed url is rejected when any domain filter is active", () => {
    expect(shouldIndex(result({ url: "not a url" }), { ...baseCfg, domainAllowlist: new Set(["example.com"]) })).toBe(false);
    expect(shouldIndex(result({ url: "not a url" }), { ...baseCfg, domainBlocklist: new Set(["x.com"]) })).toBe(false);
    expect(shouldIndex(result({ url: "not a url" }), baseCfg)).toBe(true);
  });
});
