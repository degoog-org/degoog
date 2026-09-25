import { describe, test, expect } from "bun:test";
import { fetchWithSafeRedirects } from "../../../src/server/utils/security/safe-redirects";
import type { TransportFetchOptions } from "../../../src/server/types/extension";

const redirectTo = (location: string): Response =>
  new Response(null, { status: 302, headers: { location } });

const recorder = (responses: Record<string, Response>) => {
  const calls: { url: string; init: TransportFetchOptions }[] = [];
  const fetchFn = async (url: string, init: TransportFetchOptions): Promise<Response> => {
    calls.push({ url, init });
    return responses[url] ?? new Response("ok", { status: 200 });
  };
  return { calls, fetchFn };
};

describe("fetchWithSafeRedirects", () => {
  test("refuses a redirect that lands on a private address", async () => {
    const { calls, fetchFn } = recorder({
      "http://93.184.215.14/start": redirectTo("http://127.0.0.1:8080/admin"),
    });
    const res = await fetchWithSafeRedirects(fetchFn, "http://93.184.215.14/start", {});
    expect(res).toBeNull();
    expect(calls.map((c) => c.url)).toEqual(["http://93.184.215.14/start"]);
  });

  test("refuses a private starting address without fetching it", async () => {
    const { calls, fetchFn } = recorder({});
    expect(await fetchWithSafeRedirects(fetchFn, "http://10.0.0.1/", {})).toBeNull();
    expect(calls).toEqual([]);
  });

  test("follows public redirects hop by hop with redirects handled manually", async () => {
    const { calls, fetchFn } = recorder({
      "http://93.184.215.14/a": redirectTo("/b"),
    });
    const res = await fetchWithSafeRedirects(fetchFn, "http://93.184.215.14/a", {
      headers: { Accept: "text/html" },
    });
    expect(res?.status).toBe(200);
    expect(calls.map((c) => c.url)).toEqual(["http://93.184.215.14/a", "http://93.184.215.14/b"]);
    expect(calls.every((c) => c.init.redirect === "manual")).toBe(true);
    expect(calls[1].init.headers).toEqual({ Accept: "text/html" });
  });
});
