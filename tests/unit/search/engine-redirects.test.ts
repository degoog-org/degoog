import { afterEach, describe, test, expect, mock } from "bun:test";

const SSRF_MOD = "../../../src/server/utils/security/ssrf";
const ssrfReal = { ...(await import(SSRF_MOD)) };

afterEach(() => {
  mock.module(SSRF_MOD, () => ssrfReal);
});
import {
  isEngineSite,
  makeRedirectResolver,
  MAX_REDIRECT_HOPS,
  MAX_REDIRECT_RESOLVES,
} from "../../../src/server/search/engine-redirects";

const PUBLIC = "http://93.184.215.14";

const redirectTo = (location: string): Response =>
  new Response(null, { status: 302, headers: { location } });

const recorder = (responses: Record<string, () => Response>) => {
  const calls: { url: string; redirect?: RequestRedirect }[] = [];
  const fetchFn = async (url: string, init?: { redirect?: RequestRedirect }): Promise<Response> => {
    calls.push({ url, redirect: init?.redirect });
    return responses[url]?.() ?? new Response("ok", { status: 200 });
  };
  return { calls, fetchFn };
};

const ENGINE_HOSTS = new Set(["93.184.215.14", "127.0.0.1", "10.0.0.1"]);
const on = { enabled: async (): Promise<boolean> => true, fetchedHosts: ENGINE_HOSTS };
const off = { enabled: async (): Promise<boolean> => false, fetchedHosts: ENGINE_HOSTS };

describe("isEngineSite", () => {
  test("covers the fetched host, its parent site and sibling subdomains", () => {
    const fetched = ["www.google.com"];
    expect(isEngineSite("www.google.com", fetched)).toBe(true);
    expect(isEngineSite("google.com", fetched)).toBe(true);
    expect(isEngineSite("redirect.google.com", fetched)).toBe(true);
    expect(isEngineSite("duckduckgo.com", ["html.duckduckgo.com"])).toBe(true);
    expect(isEngineSite("r.search.yahoo.com", ["search.yahoo.com"])).toBe(true);
  });

  test("leaves result destinations and lookalikes out", () => {
    const fetched = ["www.google.com"];
    expect(isEngineSite("en.wikipedia.org", fetched)).toBe(false);
    expect(isEngineSite("notgoogle.com", fetched)).toBe(false);
    expect(isEngineSite("google.com.evil.test", fetched)).toBe(false);
    expect(isEngineSite("www.google.com", [])).toBe(false);
  });

  test("a bare two-label host never widens to its tld", () => {
    expect(isEngineSite("evil.com", ["google.com"])).toBe(false);
    expect(isEngineSite("x.google.com", ["google.com"])).toBe(true);
  });

  test("ip hosts only ever match themselves", () => {
    expect(isEngineSite("1.184.215.14", ["93.184.215.14"])).toBe(false);
    expect(isEngineSite("93.184.215.14", ["93.184.215.14"])).toBe(true);
  });
});

describe("makeRedirectResolver", () => {
  test("refuses links outside the engine's own site without fetching them", async () => {
    const { calls, fetchFn } = recorder({});
    const resolve = makeRedirectResolver(fetchFn, {
      enabled: async () => true,
      fetchedHosts: new Set(["www.google.com"]),
    });
    expect(await resolve("https://en.wikipedia.org/wiki/Redirect")).toBeNull();
    expect(calls).toEqual([]);
  });

  test("resolves a sibling redirect host of the engine without fetching the destination", async () => {
    mock.module(SSRF_MOD, () => ({ ...ssrfReal, isSafeHost: async () => true }));
    const { calls, fetchFn } = recorder({
      "https://redirect.google.com/r?u=1": () => redirectTo("https://en.wikipedia.org/wiki/Redirect"),
    });
    const resolve = makeRedirectResolver(fetchFn, {
      enabled: async () => true,
      fetchedHosts: new Set(["www.google.com"]),
    });
    expect(await resolve("https://redirect.google.com/r?u=1")).toBe(
      "https://en.wikipedia.org/wiki/Redirect",
    );
    expect(calls.map((c) => c.url)).toEqual(["https://redirect.google.com/r?u=1"]);
  });

  test("does nothing while the engine has it switched off", async () => {
    const { calls, fetchFn } = recorder({});
    const resolve = makeRedirectResolver(fetchFn, off);
    expect(await resolve(`${PUBLIC}/go/1`)).toBeNull();
    expect(calls).toEqual([]);
  });

  test("returns a cross-origin destination without ever fetching it", async () => {
    const { calls, fetchFn } = recorder({
      [`${PUBLIC}/go/1`]: () => redirectTo("https://example.org/page?a=1"),
    });
    const resolve = makeRedirectResolver(fetchFn, on);
    expect(await resolve(`${PUBLIC}/go/1`)).toBe("https://example.org/page?a=1");
    expect(calls).toEqual([{ url: `${PUBLIC}/go/1`, redirect: "manual" }]);
  });

  test("follows same-origin hops, then gives up past the hop limit", async () => {
    const chain: Record<string, () => Response> = {};
    for (let i = 0; i < MAX_REDIRECT_HOPS; i++) {
      chain[`${PUBLIC}/hop/${i}`] = () => redirectTo(`/hop/${i + 1}`);
    }
    const { calls, fetchFn } = recorder(chain);
    const resolve = makeRedirectResolver(fetchFn, on);
    expect(await resolve(`${PUBLIC}/hop/0`)).toBeNull();
    expect(calls).toHaveLength(MAX_REDIRECT_HOPS);
  });

  test("fails closed when the transport followed the redirect itself", async () => {
    const { fetchFn } = recorder({});
    expect(await makeRedirectResolver(fetchFn, on)(`${PUBLIC}/go/1`)).toBeNull();
  });

  test("fails closed on a redirect without a location", async () => {
    const { fetchFn } = recorder({ [`${PUBLIC}/go/1`]: () => new Response(null, { status: 302 }) });
    expect(await makeRedirectResolver(fetchFn, on)(`${PUBLIC}/go/1`)).toBeNull();
  });

  test("refuses private hosts without fetching them", async () => {
    const { calls, fetchFn } = recorder({});
    const resolve = makeRedirectResolver(fetchFn, on);
    expect(await resolve("http://127.0.0.1/go/1")).toBeNull();
    expect(await resolve("http://10.0.0.1/go/1")).toBeNull();
    expect(calls).toEqual([]);
  });

  test("refuses non-web destinations and inputs", async () => {
    const { calls, fetchFn } = recorder({
      [`${PUBLIC}/go/1`]: () => redirectTo("javascript:alert(1)"),
    });
    const resolve = makeRedirectResolver(fetchFn, on);
    expect(await resolve(`${PUBLIC}/go/1`)).toBeNull();
    expect(await resolve("file:///etc/passwd")).toBeNull();
    expect(calls).toHaveLength(1);
  });

  test("strips credentials from the destination", async () => {
    const { fetchFn } = recorder({
      [`${PUBLIC}/go/1`]: () => redirectTo("https://user:pass@example.org/"),
    });
    expect(await makeRedirectResolver(fetchFn, on)(`${PUBLIC}/go/1`)).toBe("https://example.org/");
  });

  test("stops resolving once the per-run budget is spent", async () => {
    const { calls, fetchFn } = recorder({
      [`${PUBLIC}/go/1`]: () => redirectTo("https://example.org/"),
    });
    const resolve = makeRedirectResolver(fetchFn, on);
    for (let i = 0; i < MAX_REDIRECT_RESOLVES; i++) await resolve(`${PUBLIC}/go/1`);
    expect(await resolve(`${PUBLIC}/go/1`)).toBeNull();
    expect(calls).toHaveLength(MAX_REDIRECT_RESOLVES);
  });

  test("keeps the budget when resolves run concurrently", async () => {
    const { calls, fetchFn } = recorder({
      [`${PUBLIC}/go/1`]: () => redirectTo("https://example.org/"),
    });
    const resolve = makeRedirectResolver(fetchFn, on);
    const urls = Array.from({ length: MAX_REDIRECT_RESOLVES * 2 }, () => `${PUBLIC}/go/1`);
    await Promise.all(urls.map((u) => resolve(u)));
    expect(calls).toHaveLength(MAX_REDIRECT_RESOLVES);
  });

  test("never throws when the transport does", async () => {
    const resolve = makeRedirectResolver(async () => {
      throw new Error("boom");
    }, on);
    expect(await resolve(`${PUBLIC}/go/1`)).toBeNull();
  });
});
