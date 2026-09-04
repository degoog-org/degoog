import { describe, test, expect } from "bun:test";
import { isUboFilterLine, uboLineToDomain } from "../../src/server/utils/ubo-filter";

describe("uBO filter line detection", () => {
  test("flags comments, exceptions and cosmetic rules", () => {
    expect(isUboFilterLine("! Title: Huge AI Blocklist")).toBe(true);
    expect(isUboFilterLine("@@||keep.google.com^$ehide")).toBe(true);
    expect(isUboFilterLine("||ads.example.com^")).toBe(true);
    expect(isUboFilterLine('bing.com##a[href*="forkful.ai"]:upward(li):remove()')).toBe(true);
  });

  test("leaves plain list entries alone", () => {
    expect(isUboFilterLine("quora.com")).toBe(false);
    expect(isUboFilterLine("/.*\\.spam\\.net/")).toBe(false);
  });
});

describe("uBO line to domain", () => {
  test("extracts the href hostname from both rule shapes", () => {
    expect(
      uboLineToDomain('duckduckgo.com,bing.com##a[href*="forkful.ai"]:upward(li):remove()'),
    ).toBe("forkful.ai");
    expect(
      uboLineToDomain('google.com##a[href*="Perplexity.AI"]:upward(2):remove()'),
    ).toBe("perplexity.ai");
  });

  test("keeps a leading-slash payload that is still just a host", () => {
    expect(uboLineToDomain('google.com##a[href*="/play.ht"]:upward(2):remove()')).toBe("play.ht");
  });

  test("extracts a hostname-only network filter", () => {
    expect(uboLineToDomain("||Ads.Example.com^")).toBe("ads.example.com");
  });

  test("does not treat attribute names containing href as href selectors", () => {
    expect(uboLineToDomain('google.com##a[data-href*="tracking.example"]')).toBeNull();
    expect(uboLineToDomain('google.com##a[not-href*="tracking.example"]')).toBeNull();
  });

  test("skips path-scoped payloads rather than blocking their host", () => {
    expect(uboLineToDomain('bing.com##a[href*="x.com/someartist"]:upward(li):remove()')).toBeNull();
    expect(
      uboLineToDomain('bing.com##a[href*="play.google.com/store/apps/details?id=x"]:upward(li):remove()'),
    ).toBeNull();
  });

  test("skips comments, exceptions and rules without a usable domain", () => {
    expect(uboLineToDomain("! HAPPY PRIDE MONTH")).toBeNull();
    expect(uboLineToDomain("@@||keep.google.com^$ehide")).toBeNull();
    expect(uboLineToDomain("google.com##.YzCcne:remove()")).toBeNull();
    expect(uboLineToDomain("github.com##div.AppHeader-CopilotChat")).toBeNull();
    expect(uboLineToDomain('bing.com##a[href*="ver_AI_"]:upward(li):remove()')).toBeNull();
  });
});
