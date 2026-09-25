import { describe, test, expect, beforeEach } from "bun:test";
import {
  isUrlAllowedForOutgoing,
  setOutgoingAllowlist,
} from "../../../src/server/utils/net/outgoing";

describe("outgoing", () => {
  beforeEach(() => {
    const prev = process.env.DEGOOG_OUTGOING_ALLOWED_HOSTS;
    setOutgoingAllowlist([]);
    if (prev !== undefined) process.env.DEGOOG_OUTGOING_ALLOWED_HOSTS = prev;
  });

  describe("isUrlAllowedForOutgoing", () => {
    test("returns false for non-http(s) protocols and unparseable urls", () => {
      setOutgoingAllowlist(["*"]);
      expect(isUrlAllowedForOutgoing("ftp://host.com")).toBe(false);
      expect(isUrlAllowedForOutgoing("file:///local")).toBe(false);
      expect(isUrlAllowedForOutgoing("not-a-url")).toBe(false);
    });

    test("when allowlist has hosts, allows only those hosts", () => {
      setOutgoingAllowlist(["example.com", "api.example.org"]);
      expect(isUrlAllowedForOutgoing("https://example.com/path")).toBe(true);
      expect(isUrlAllowedForOutgoing("http://api.example.org")).toBe(true);
      expect(isUrlAllowedForOutgoing("https://other.com")).toBe(false);
    });

    test("host matching is case-insensitive", () => {
      setOutgoingAllowlist(["Example.COM"]);
      expect(isUrlAllowedForOutgoing("https://example.com")).toBe(true);
      expect(isUrlAllowedForOutgoing("https://EXAMPLE.COM")).toBe(true);
    });

    test("when allowlist has *, allows any http(s) URL", () => {
      setOutgoingAllowlist(["*"]);
      expect(isUrlAllowedForOutgoing("https://any.com")).toBe(true);
      expect(isUrlAllowedForOutgoing("http://other.org")).toBe(true);
    });

    test("empty allowlist denies all", () => {
      setOutgoingAllowlist(["example.com"]);
      setOutgoingAllowlist([]);
      expect(isUrlAllowedForOutgoing("https://example.com")).toBe(false);
    });
  });
});
