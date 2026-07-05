import { describe, test, expect } from "bun:test";
import { linkHref } from "../../src/client/utils/dom";

describe("client/linkHref scheme allowlist", () => {
  test("passes through http and https urls", () => {
    expect(linkHref("http://example.com/a")).toBe("http://example.com/a");
    expect(linkHref("https://example.com/a")).toBe("https://example.com/a");
  });

  test("passes through magnet links for torrent engines", () => {
    const magnet = "magnet:?xt=urn:btih:abcdef";
    expect(linkHref(magnet)).toBe(magnet);
  });

  test("blanks javascript: urls", () => {
    expect(linkHref("javascript:alert(document.cookie)")).toBe("");
  });

  test("blanks data: urls", () => {
    expect(linkHref("data:text/html,<script>alert(1)</script>")).toBe("");
  });

  test("blanks javascript: urls hidden behind leading control chars", () => {
    expect(linkHref("\t\n javascript:alert(1)")).toBe("");
  });

  test("blanks javascript with mixed case scheme", () => {
    expect(linkHref("JaVaScRiPt:alert(1)")).toBe("");
  });

  test("keeps scheme-relative and relative urls", () => {
    expect(linkHref("//example.com/a")).toBe("//example.com/a");
    expect(linkHref("/local/path")).toBe("/local/path");
  });

  test("returns empty string for empty input", () => {
    expect(linkHref("")).toBe("");
    expect(linkHref(null)).toBe("");
    expect(linkHref(undefined)).toBe("");
  });
});
