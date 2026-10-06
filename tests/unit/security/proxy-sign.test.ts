import { describe, test, expect, beforeAll } from "bun:test";
import { initServerKey } from "../../../src/server/utils/security/server-key";
import {
  isSealedResult,
  proxyHtmlImages,
  proxyMarkdownImages,
  signResultThumbnails,
  verifyProxyUrl,
} from "../../../src/server/utils/net/proxy-sign";
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

describe("proxy-sign own proxy detection", () => {
  test.each([
    ["/api/proxy/../store/update-all/stream"],
    ["/api/proxy/%2e%2e/store/repos/refresh/stream"],
    ["/api/proxy/image/../../settings"],
    ["/api/proxy/whatever?url=x"],
  ])("%s is not trusted as the instance's own proxy", (thumb) => {
    const [signed] = signResultThumbnails([result(thumb)]);
    expect(signed.thumbnail).toStartWith("/api/proxy/image?url=");
    expect(signed.thumbnail).toContain(encodeURIComponent(thumb));
  });

  test("own favicon proxy URLs are left alone", () => {
    const own = "/api/proxy/favicon?domain=example.org";
    const [signed] = signResultThumbnails([result(own)]);
    expect(signed.thumbnail).toBe(own);
  });
});

describe("proxy-sign extension routes", () => {
  test.each([
    ["/api/engine/immich/thumb?id=abc"],
    ["/api/plugin/immich/thumb?id=abc"],
    ["http://localhost:4444/api/engine/immich/thumb?id=abc"],
  ])("extension route %s goes through the image proxy", (thumb) => {
    const [signed] = signResultThumbnails([result(thumb)]);
    expect(signed.thumbnail).toStartWith("/api/proxy/image?url=");
  });
});

describe("proxy-sign result seals", () => {
  test("every signed result carries a seal that verifies for its url", () => {
    const [sealed] = signResultThumbnails([result("https://cdn.example/a.png")]);
    expect(isSealedResult(sealed)).toBe(true);
  });

  test("a seal does not survive a swapped url or go missing", () => {
    const [sealed] = signResultThumbnails([result("https://cdn.example/a.png")]);
    expect(isSealedResult({ ...sealed, url: "https://attacker.example/" })).toBe(false);
    expect(isSealedResult({ ...sealed, seal: undefined })).toBe(false);
    expect(isSealedResult(null)).toBe(false);
  });

  test("a seal is not a valid image proxy signature for the same url", () => {
    const [sealed] = signResultThumbnails([result("https://cdn.example/a.png")]);
    expect(verifyProxyUrl(sealed.url, sealed.seal ?? "")).toBe(false);
  });
});

describe("proxy-sign markdown images", () => {
  test("remote markdown and html images go through the proxy, links and local paths do not", () => {
    const md = [
      "![badge](https://img.shields.io/badge/x-y-green \"t\")",
      '<img alt="a" src="https://cdn.example/a.png">',
      "[a link](https://example.org/page)",
      "![local](./screenshot.png)",
    ].join("\n");
    const out = proxyMarkdownImages(md).split("\n");
    expect(out[0]).toStartWith("![badge](/api/proxy/image?url=");
    expect(out[0]).toContain(encodeURIComponent("https://img.shields.io/badge/x-y-green"));
    expect(out[0]).toEndWith(' "t")');
    expect(out[1]).toContain('src="/api/proxy/image?url=');
    expect(out[2]).toBe("[a link](https://example.org/page)");
    expect(out[3]).toBe("![local](./screenshot.png)");
  });
});

describe("proxy-sign plugin html images", () => {
  test("remote img, source, poster and srcset go through the proxy", () => {
    const out = proxyHtmlImages(
      '<img src="https://cdn.example/a.png?x=1&amp;y=2" alt="a">' +
        '<video poster="https://cdn.example/p.jpg"><source src="https://cdn.example/v.mp4"></video>' +
        '<img srcset="https://cdn.example/s1.png 1x, https://cdn.example/s2.png 2x">',
    );
    expect(out).not.toMatch(/(src|poster|srcset)="https:/);
    expect(out).toContain(encodeURIComponent("https://cdn.example/a.png?x=1&y=2"));
    expect(out).toContain(" 2x");
    expect(out.match(/\/api\/proxy\/image\?url=/g)).toHaveLength(5);
  });

  test("links, local images and the instance's own proxy URLs are left alone", () => {
    const html =
      '<a href="https://example.org">x</a><img src="/public/logo.png">' +
      '<img src="/api/proxy/image?url=https%3A%2F%2Fcdn.example%2Fa.png&sig=abc">';
    expect(proxyHtmlImages(html)).toBe(html);
  });
});
