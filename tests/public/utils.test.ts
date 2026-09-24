import { describe, test, expect } from "bun:test";
import { cleanHostname, cleanUrl } from "../../src/client/utils/dom/dom";
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

  test("cleanHostname returns the hostname and leaves invalid urls alone", () => {
    expect(cleanHostname("https://sub.example.com/path")).toBe("sub.example.com");
    expect(cleanHostname("xxx")).toBe("xxx");
    expect(cleanUrl("not-a-url")).toBe("not-a-url");
  });
});
