import { describe, expect, test } from "bun:test";
import { toWikiDomain } from "../../src/server/extensions/commands/builtins/wikipedia/index";

describe("wikipedia toWikiDomain", () => {
  test("defaults to en.wikipedia.org when empty or missing", () => {
    expect(toWikiDomain("")).toBe("en.wikipedia.org");
    expect(toWikiDomain(undefined)).toBe("en.wikipedia.org");
    expect(toWikiDomain(null)).toBe("en.wikipedia.org");
  });

  test("accepts a valid language subdomain", () => {
    expect(toWikiDomain("fr.wikipedia.org")).toBe("fr.wikipedia.org");
    expect(toWikiDomain("zh-yue.wikipedia.org")).toBe("zh-yue.wikipedia.org");
  });

  test("strips protocol, path and trailing slashes", () => {
    expect(toWikiDomain("https://fr.wikipedia.org")).toBe("fr.wikipedia.org");
    expect(toWikiDomain("fr.wikipedia.org/")).toBe("fr.wikipedia.org");
    expect(toWikiDomain("http://it.wikipedia.org/wiki/Foo")).toBe(
      "it.wikipedia.org",
    );
    expect(toWikiDomain("  DE.WIKIPEDIA.ORG  ")).toBe("de.wikipedia.org");
  });

  test("rejects non-wikipedia hosts and falls back to default", () => {
    expect(toWikiDomain("evil.example.com")).toBe("en.wikipedia.org");
    expect(toWikiDomain("fr.wikipedia.org.evil.com")).toBe("en.wikipedia.org");
    expect(toWikiDomain("wikipedia.org")).toBe("en.wikipedia.org");
  });
});
