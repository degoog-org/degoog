import { describe, test, expect } from "bun:test";
import { linkHref } from "../../../src/shared/utils/url";

describe("client/linkHref scheme allowlist", () => {
  const cases: [string | null | undefined, string][] = [
    ["http://example.com/a", "http://example.com/a"],
    ["https://example.com/a", "https://example.com/a"],
    ["magnet:?xt=urn:btih:abcdef", "magnet:?xt=urn:btih:abcdef"],
    ["//example.com/a", "//example.com/a"],
    ["/local/path", "/local/path"],
    ["javascript:alert(document.cookie)", ""],
    ["JaVaScRiPt:alert(1)", ""],
    ["\t\n javascript:alert(1)", ""],
    ["data:text/html,<script>alert(1)</script>", ""],
    ["", ""],
    [null, ""],
    [undefined, ""],
  ];

  for (const [input, expected] of cases) {
    test(`${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => {
      expect(linkHref(input)).toBe(expected);
    });
  }
});
