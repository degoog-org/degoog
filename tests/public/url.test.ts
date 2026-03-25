import { describe, test, expect } from "bun:test";
import {
  buildSearchUrl,
  proxyImageUrl,
  faviconUrl,
} from "../../src/client/utils/url";
import { state } from "../../src/client/state";

describe("public/url", () => {
  test("proxyImageUrl returns empty for empty url", () => {
    expect(proxyImageUrl("")).toBe("");
  });

  test("proxyImageUrl returns path with encoded url", () => {
    const out = proxyImageUrl("https://example.com/img.png");
    expect(out).toContain("/api/proxy/image");
    expect(out).toContain("url=");
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
    state.currentImageFilters = {
      size: "any",
      color: "any",
      type: "any",
      layout: "any",
      license: "any",
    };
    const out = buildSearchUrl("test query", { duckduckgo: true }, "all", 1);
    expect(out).toContain("/api/search");
    expect(out).toContain("q=test+query");
    expect(out).toContain("duckduckgo=true");
  });

  test("buildSearchUrl includes image filters for image searches", () => {
    state.currentTimeFilter = "day";
    state.currentImageFilters = {
      size: "large",
      color: "blue",
      type: "gif",
      layout: "wide",
      license: "commercial",
    };
    const out = buildSearchUrl("test query", { duckduckgo: true }, "images", 1);
    expect(out).toContain("/api/search");
    expect(out).toContain("type=images");
    expect(out).toContain("time=day");
    expect(out).toContain("imgSize=large");
    expect(out).toContain("imgColor=blue");
    expect(out).toContain("imgType=gif");
    expect(out).toContain("imgLayout=wide");
    expect(out).toContain("imgLicense=commercial");
  });
});
