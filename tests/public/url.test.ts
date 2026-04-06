import { describe, test, expect } from "bun:test";
import { buildSearchUrl, proxyImageUrl, faviconUrl } from "../../src/client/utils/url";
import { state } from "../../src/client/state";

function withMockLocation(href: string, callback: () => void) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "location");

  Object.defineProperty(globalThis, "location", {
    value: new URL(href),
    configurable: true,
  });

  try {
    callback();
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, "location", previous);
    } else {
      delete (globalThis as { location?: URL }).location;
    }
  }
}

describe("public/url", () => {
  test("proxyImageUrl returns empty for empty url", () => {
    expect(proxyImageUrl("")).toBe("");
  });

  test("proxyImageUrl proxies cross-origin absolute urls", () => {
    const out = proxyImageUrl("https://example.com/img.png");
    expect(out).toContain("/api/proxy/image");
    expect(out).toContain("url=");
  });

  test("proxyImageUrl keeps root-relative same-origin urls direct", () => {
    expect(proxyImageUrl("/api/plugin/example/image?id=1")).toBe(
      "/api/plugin/example/image?id=1",
    );
  });

  test("proxyImageUrl keeps same-origin absolute urls direct", () => {
    withMockLocation("https://degoog.local/search?q=test", () => {
      expect(
        proxyImageUrl("https://degoog.local/api/plugin/example/image?id=1"),
      ).toBe("https://degoog.local/api/plugin/example/image?id=1");
    });
  });

  test("faviconUrl returns empty for invalid url", () => {
    expect(faviconUrl("not-a-url")).toBe("");
  });

  test("faviconUrl returns proxy path for valid url", () => {
    const out = faviconUrl("https://example.com/page");
    expect(out).toContain("/api/proxy/image");
  });

  test("buildSearchUrl includes query and engine params", () => {
    state.currentTimeFilter = "any";
    const out = buildSearchUrl("test query", { duckduckgo: true }, "all", 1);
    expect(out).toContain("/api/search");
    expect(out).toContain("q=test+query");
    expect(out).toContain("duckduckgo=true");
  });
});
