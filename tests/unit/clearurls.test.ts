import { describe, test, expect } from "bun:test";
import { applyClearUrls, loadClearUrlsForTest } from "../../src/server/search/clearurls";
import { cleanUrl } from "../../src/server/search/url-normalize";
import rulesData from "../../src/server/search/clearurls-rules.json";

// A cut-down ruleset in the real ClearURLs shape, so these assert on rule SEMANTICS rather than on
// whatever the live ruleset happens to contain today.
const RULES = {
  globalRules: {
    urlPattern: ".*",
    rules: ["utm_[^=]*", "ref_?src"],
    exceptions: ["^https?:\\/\\/(?:[a-z0-9-]+\\.)*?example\\.org"],
  },
  rawy: {
    urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?rawy\\.test",
    rawRules: ["\\/tr\\/[a-z0-9]+"],
  },
  breaky: {
    urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?breaky\\.test",
    rawRules: ["^https?:\\/\\/"],
  },
  amazon: {
    urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?amazon(?:\\.[a-z]{2,}){1,}",
    rules: ["pd_rd_[^=]*", "psc"],
    referralMarketing: ["tag"],
  },
  google: {
    urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?google(?:\\.[a-z]{2,}){1,}",
    rules: ["ved", "ei"],
    redirections: ["^https?:\\/\\/(?:[a-z0-9-]+\\.)*?google(?:\\.[a-z]{2,}){1,}\\/url\\?.*?url=([^&]*)"],
  },
};

describe("clearurls", () => {
  test("strips site-specific parameters the static list does not know", () => {
    loadClearUrlsForTest(RULES);
    const out = applyClearUrls(
      "https://www.amazon.de/dp/B0TEST?pd_rd_w=abc&psc=1&keywords=kettle",
    );
    expect(out).not.toContain("pd_rd_w");
    expect(out).not.toContain("psc=");
    expect(out).toContain("keywords=kettle");
  });

  test("strips referral marketing parameters", () => {
    loadClearUrlsForTest(RULES);
    expect(applyClearUrls("https://www.amazon.de/dp/B0TEST?tag=someaffiliate")).not.toContain("tag=");
  });

  test("unwraps a redirector to its destination", () => {
    loadClearUrlsForTest(RULES);
    expect(
      applyClearUrls("https://www.google.com/url?sa=t&url=https%3A%2F%2Fnixos.org%2F"),
    ).toBe("https://nixos.org/");
  });

  test("refuses a redirect target that is not http or https", () => {
    loadClearUrlsForTest(RULES);
    for (const bad of [
      "javascript%3Aalert(1)",
      "data%3Atext%2Fhtml%2C%3Cscript%3Ealert(1)%3C%2Fscript%3E",
      "file%3A%2F%2F%2Fetc%2Fpasswd",
    ]) {
      const out = applyClearUrls(`https://www.google.com/url?sa=t&url=${bad}`);
      expect(out.startsWith("https://www.google.com/")).toBe(true);
      expect(out).not.toContain("javascript:");
      expect(out).not.toContain("data:");
      expect(out).not.toContain("file:");
    }
  });

  test("honours provider exceptions", () => {
    loadClearUrlsForTest(RULES);
    const url = "https://example.org/page?utm_source=news";
    expect(applyClearUrls(url)).toContain("utm_source=news");
  });

  test("a rawRule strips every occurrence, not only the first", () => {
    loadClearUrlsForTest(RULES);
    expect(applyClearUrls("https://rawy.test/a/tr/abc123/b/tr/def456/c")).toBe(
      "https://rawy.test/a/b/c",
    );
  });

  test("a rawRule that breaks the URL does not abandon cleaning", () => {
    loadClearUrlsForTest(RULES);
    const url = "https://breaky.test/page?utm_source=news";
    // The scheme-stripping rawRule cannot produce a valid URL, so the last good value stands and the
    // global utm_ rule still applies.
    const out = applyClearUrls(url);
    expect(out).toContain("breaky.test");
    expect(out).not.toContain("utm_source");
  });

  test("leaves a URL with no matching rule untouched", () => {
    loadClearUrlsForTest(RULES);
    const url = "https://nixos.org/manual?page=2";
    expect(applyClearUrls(url)).toBe(url);
  });

  test("returns the input unchanged when it is not a URL", () => {
    loadClearUrlsForTest(RULES);
    expect(applyClearUrls("not a url")).toBe("not a url");
  });

  test("cleanUrl still applies the static list, and now ClearURLs too", () => {
    loadClearUrlsForTest(RULES);
    const out = cleanUrl("https://www.amazon.de/dp/B0TEST?fbclid=xyz&pd_rd_w=abc&psc=1");
    expect(out).not.toContain("fbclid"); // static list
    expect(out).not.toContain("pd_rd_w"); // ClearURLs
  });

  test("no ruleset loaded means the URL is returned unchanged", () => {
    loadClearUrlsForTest({});
    const url = "https://www.amazon.de/dp/B0TEST?pd_rd_w=abc";
    expect(applyClearUrls(url)).toBe(url);
  });

  // The vendored ruleset is not validated at runtime any more, because it is reviewed in a diff
  // rather than downloaded. This is that check, moved to where a bad refresh gets caught instead.
  // Reads the JSON directly, so it does not depend on which fixture a previous test left loaded.
  test("the vendored ruleset is complete and every provider compiles", () => {
    const providers = rulesData.providers as Record<string, { urlPattern?: string }>;
    expect(Object.keys(providers).length).toBeGreaterThanOrEqual(100);
    for (const p of Object.values(providers)) {
      expect(typeof p.urlPattern).toBe("string");
      expect(() => new RegExp(p.urlPattern as string, "i")).not.toThrow();
    }
  });
});
