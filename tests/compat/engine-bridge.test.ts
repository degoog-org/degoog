import { describe, test, expect } from "bun:test";
import {
  browserHeaders,
  cacheHandler,
  isWebUrl,
  toReply,
  withCookies,
} from "../../src/server/extensions/compatibility-layer/engine-bridge";
import {
  resolveSafeSearch,
  SafeSearch,
  safeSearchField,
} from "../../src/server/extensions/compatibility-layer/safe-search";
import type { EngineContext } from "../../src/server/types/search";

describe("compat engine bridge", () => {
  test("only http and https count as web urls", () => {
    expect(isWebUrl("https://a.example/x")).toBe(true);
    expect(isWebUrl("http://a.example")).toBe(true);
    expect(isWebUrl("file:///etc/passwd")).toBe(false);
    expect(isWebUrl("not a url")).toBe(false);
  });

  test("cookies join into a header unless one is already set, blanks dropped", () => {
    expect(withCookies({}, { a: "1", " b ": " 2 ", c: "", "": "x" })).toEqual({
      Cookie: "a=1; b=2",
    });
    expect(withCookies({ cookie: "keep=me" }, { a: "1" })).toEqual({ cookie: "keep=me" });
    expect(withCookies({ Accept: "x" }, undefined)).toEqual({ Accept: "x" });
  });

  test("browser headers prefer the engine context and fall back to defaults", () => {
    const ctx = {
      userAgent: () => "ctx-agent",
      buildAcceptLanguage: () => "fr-FR",
    } as unknown as EngineContext;
    expect(browserHeaders(ctx)).toEqual({
      "User-Agent": "ctx-agent",
      "Accept-Language": "fr-FR",
    });
    const fallback = browserHeaders();
    expect(fallback["Accept-Language"]).toBe("en-US,en;q=0.9");
    expect(fallback["User-Agent"].length).toBeGreaterThan(0);
  });

  test("a reply carries status, headers, set-cookie pairs and the body", async () => {
    const headers = new Headers({ "X-Test": "yes" });
    headers.append("Set-Cookie", "sid=abc; Path=/; HttpOnly");
    headers.append("Set-Cookie", "theme = dark ; Secure");
    headers.append("Set-Cookie", "=novalue");
    const reply = await toReply(new Response("body", { status: 201, headers }), "https://f.example");
    expect(reply).toEqual({
      url: "https://f.example",
      status: 201,
      headers: expect.objectContaining({ "x-test": "yes" }),
      cookies: { sid: "abc", theme: "dark" },
      text: "body",
    });
  });

  test("the cache handler stores per engine and answers null on set", async () => {
    const onCache = cacheHandler("engine-bridge-test", `engine-${Date.now()}`)!;
    expect(await onCache({ op: "get", key: "k" })).toBeNull();
    expect(await onCache({ op: "set", key: "k", value: "v", ttl: 60 })).toBeNull();
    expect(await onCache({ op: "get", key: "k" })).toBe("v");
    const other = cacheHandler("engine-bridge-test", `other-${Date.now()}`)!;
    expect(await other({ op: "get", key: "k" })).toBeNull();
  });
});

describe("compat safe search", () => {
  const withNsfw = (nsfw: string): EngineContext =>
    ({ imageFilter: { nsfw } }) as unknown as EngineContext;

  test("a request's nsfw filter overrides the engine setting", () => {
    expect(resolveSafeSearch(SafeSearch.Off, withNsfw("on"))).toBe(SafeSearch.Strict);
    expect(resolveSafeSearch(SafeSearch.Strict, withNsfw("off"))).toBe(SafeSearch.Off);
    expect(resolveSafeSearch(SafeSearch.Off, withNsfw("moderate"))).toBe(SafeSearch.Moderate);
  });

  test("no filter or an unknown one keeps the engine setting", () => {
    expect(resolveSafeSearch(SafeSearch.Moderate)).toBe(SafeSearch.Moderate);
    expect(resolveSafeSearch(SafeSearch.Strict, withNsfw("bogus"))).toBe(SafeSearch.Strict);
  });

  test("the setting field offers every level and defaults to the engine's", () => {
    expect(safeSearchField(SafeSearch.Moderate)).toEqual({
      key: "safeSearch",
      label: "Safe Search",
      type: "select",
      options: ["off", "moderate", "strict"],
      default: "moderate",
      description: "Filter explicit content from this engine's results.",
    });
  });
});
