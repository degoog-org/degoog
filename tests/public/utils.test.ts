import { describe, test, expect } from "bun:test";
import { cleanUrl, cleanHostname } from "../../src/client/utils/dom";
import { state } from "../../src/client/state";

describe("public/utils", () => {
  test("cleanUrl keeps query params by default", () => {
    state.hideUrlParams = false;
    expect(cleanUrl("https://example.com/path/to?q=1")).toBe("example.com/path/to?q=1");
  });

  test("cleanUrl drops query params when hideUrlParams enabled", () => {
    const prev = state.hideUrlParams;
    state.hideUrlParams = true;
    try {
      expect(cleanUrl("https://example.com/path/to?q=1")).toBe("example.com/path/to");
    } finally {
      state.hideUrlParams = prev;
    }
  });

  test("cleanUrl strips leading www", () => {
    expect(cleanUrl("https://www.example.com/path?v=EaY-_Y83WNs")).toBe(
      "example.com/path?v=EaY-_Y83WNs",
    );
  });

  test("cleanUrl returns url as-is for invalid url", () => {
    expect(cleanUrl("not-a-url")).toBe("not-a-url");
  });

  test("cleanHostname returns hostname", () => {
    expect(cleanHostname("https://sub.example.com/path")).toBe("sub.example.com");
  });

  test("cleanHostname returns url as-is for invalid url", () => {
    expect(cleanHostname("xxx")).toBe("xxx");
  });
});
