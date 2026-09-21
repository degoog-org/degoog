import { describe, test, expect } from "bun:test";
import {
  followEngineFetch,
  type EngineFetcher,
} from "../../src/server/extensions/compatibility-layer/fourget/follow";

const cookieOf = (headers: Record<string, string>): string | undefined =>
  Object.entries(headers).find(([key]) => key.toLowerCase() === "cookie")?.[1];

describe("4get followEngineFetch", () => {
  test("strips Cookie on a cross-origin redirect when following", async () => {
    const seen: { url: string; cookie?: string }[] = [];
    const fetcher: EngineFetcher = async (url, init) => {
      seen.push({ url, cookie: cookieOf(init.headers) });
      expect(init.redirect).toBe("manual");
      if (url === "https://start.example/search") {
        return new Response(null, {
          status: 302,
          headers: { Location: "https://other.example/next" },
        });
      }
      return new Response("ok");
    };
    const resp = await followEngineFetch(fetcher, {
      url: "https://start.example/search",
      method: "GET",
      headers: { Cookie: "sid=1" },
      follow: true,
    });
    expect(await resp.text()).toBe("ok");
    expect(seen).toEqual([
      { url: "https://start.example/search", cookie: "sid=1" },
      { url: "https://other.example/next", cookie: undefined },
    ]);
  });

  test("keeps Cookie on a same-origin redirect", async () => {
    const seen: { url: string; cookie?: string }[] = [];
    const fetcher: EngineFetcher = async (url, init) => {
      seen.push({ url, cookie: cookieOf(init.headers) });
      if (url.endsWith("/search")) {
        return new Response(null, {
          status: 302,
          headers: { Location: "https://start.example/sp/search" },
        });
      }
      return new Response("ok");
    };
    await followEngineFetch(fetcher, {
      url: "https://start.example/search",
      method: "GET",
      headers: { Cookie: "sid=1" },
      follow: true,
    });
    expect(seen[1]).toEqual({
      url: "https://start.example/sp/search",
      cookie: "sid=1",
    });
  });

  const rewrites: [number, string, { method?: string; body?: string; type?: string }][] = [
    [302, "POST", { method: undefined, body: undefined, type: undefined }],
    [303, "PUT", { method: undefined, body: undefined, type: undefined }],
    [
      307,
      "POST",
      {
        method: "POST",
        body: "q=cats",
        type: "application/x-www-form-urlencoded",
      },
    ],
  ];

  for (const [status, method, landed] of rewrites) {
    test(`a ${status} redirect of a ${method} sends ${landed.method ?? "GET"} with ${landed.body ?? "no body"}`, async () => {
      const seen: { method?: string; body?: string; type?: string }[] = [];
      const fetcher: EngineFetcher = async (url, init) => {
        seen.push({
          method: init.method,
          body: init.body,
          type: init.headers["Content-Type"],
        });
        if (url.endsWith("/search")) {
          return new Response(null, {
            status,
            headers: { Location: "https://start.example/landed" },
          });
        }
        return new Response("ok");
      };
      await followEngineFetch(fetcher, {
        url: "https://start.example/search",
        method,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        data: "q=cats",
        follow: true,
      });
      expect(seen[0]).toEqual({
        method,
        body: "q=cats",
        type: "application/x-www-form-urlencoded",
      });
      expect(seen[1]).toEqual(landed);
    });
  }

  test("does not follow when the scraper did not ask", async () => {
    let calls = 0;
    const fetcher: EngineFetcher = async () => {
      calls += 1;
      return new Response(null, {
        status: 302,
        headers: { Location: "https://other.example/next" },
      });
    };
    const resp = await followEngineFetch(fetcher, {
      url: "https://start.example/search",
      method: "GET",
      headers: { Cookie: "sid=1" },
      follow: false,
    });
    expect(resp.status).toBe(302);
    expect(calls).toBe(1);
  });
});
