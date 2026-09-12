import { describe, test, expect, beforeAll } from "bun:test";
import { buildSearchUrl, faviconUrl } from "../../src/client/utils/url";
import { state } from "../../src/client/state";

const withBase = (base: string, fn: () => void): void => {
  const g = globalThis as unknown as { window: { __DEGOOG_BASE_URL__?: string } };
  const prev = g.window.__DEGOOG_BASE_URL__;
  g.window.__DEGOOG_BASE_URL__ = base;
  try {
    fn();
  } finally {
    g.window.__DEGOOG_BASE_URL__ = prev;
  }
};

describe("public/url", () => {
  beforeAll(() => {
    const g = globalThis as unknown as { window?: { __DEGOOG_BASE_URL__?: string } };
    if (!g.window) g.window = {};
    g.window.__DEGOOG_BASE_URL__ = "";
  });

  test("faviconUrl returns empty for invalid url", () => {
    expect(faviconUrl("not-a-url")).toBe("");
  });

  test("faviconUrl returns proxy path for valid url", () => {
    const out = faviconUrl("https://example.com/page");
    expect(out).toContain("/api/proxy/favicon");
    expect(out).toContain("domain=");
    expect(out).toContain("example.com");
  });

  test("buildSearchUrl includes query and engine params", () => {
    state.currentTimeFilter = "any";
    const out = buildSearchUrl("test query", { duckduckgo: true }, "all", 1);
    expect(out).toContain("/api/search");
    expect(out).toContain("q=test+query");
    expect(out).toContain("duckduckgo=true");
  });

  test("buildSearchUrl prefixes with the configured base url", () => {
    withBase("/degoog", () => {
      state.currentTimeFilter = "any";
      const out = buildSearchUrl("test query", { duckduckgo: true }, "all", 1);
      expect(out.startsWith("/degoog/api/search?")).toBe(true);
    });
  });
});
