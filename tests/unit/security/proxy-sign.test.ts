import { describe, test, expect, beforeAll } from "bun:test";
import { initServerKey } from "../../../src/server/utils/security/server-key";
import { signResultThumbnails } from "../../../src/server/utils/net/proxy-sign";
import type { ScoredResult } from "../../../src/shared/search-types";

const result = (thumbnail: string): ScoredResult =>
  ({ title: "t", url: "https://example.org/", snippet: "", source: "e", score: 1, thumbnail }) as ScoredResult;

beforeAll(async () => {
  await initServerKey();
});

describe("proxy-sign thumbnails", () => {
  test("a third-party thumbnail whose path mentions /api/proxy/ still goes through the proxy", () => {
    const [signed] = signResultThumbnails([result("https://evil.example/api/proxy/pixel.png")]);
    expect(signed.thumbnail).toStartWith("/api/proxy/image?url=");
    expect(signed.thumbnail).toContain(encodeURIComponent("https://evil.example/api/proxy/pixel.png"));
  });

  test("a protocol-relative thumbnail is not treated as the instance's own proxy", () => {
    const [signed] = signResultThumbnails([result("//evil.example/api/proxy/pixel.png")]);
    expect(signed.thumbnail).toStartWith("/api/proxy/image?url=");
  });

  test("the instance's own proxy URLs are left alone", () => {
    const own = "/api/proxy/image?url=https%3A%2F%2Fexample.org%2Fa.png&sig=abc";
    const [signed] = signResultThumbnails([result(own)]);
    expect(signed.thumbnail).toBe(own);
  });
});
