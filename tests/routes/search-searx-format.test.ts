import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import {
  getInstanceSettings,
  updateInstanceSettings,
  type ServerSettingValue,
} from "../../src/server/utils/server-settings";

const HANDLERS_MOD = "../../src/server/routes/search/_search-handlers";

const FAKE_RESULT = {
  title: "Rust lifetimes",
  url: "https://doc.rust-lang.org/book/ch10-03.html?x=1",
  snippet: "A lifetime is...",
  source: "Brave",
  score: 92,
  sources: ["Brave"],
};

const handlersReal = { ...(await import(HANDLERS_MOD)) };

let router: { request: (req: Request | string) => Response | Promise<Response> };
let saved: Record<string, ServerSettingValue> = {};

const formPost = (url: string, fields: Record<string, string>) => {
  const form = new URLSearchParams(fields);
  return router.request(
    new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    }),
  );
};

describe("POST /api/search form format fallback", () => {
  beforeAll(async () => {
    const current = await getInstanceSettings();
    saved = {
      apiKeySearchEnabled: current.apiKeySearchEnabled ?? false,
      searxApiEnabled: current.searxApiEnabled ?? false,
    };
    await updateInstanceSettings({
      apiKeySearchEnabled: false,
      searxApiEnabled: true,
    });

    mock.module(HANDLERS_MOD, () => ({
      ...handlersReal,
      handleSearch: async () => ({
        query: "rust lifetimes",
        type: "web",
        results: [FAKE_RESULT],
        engineTimings: [],
        relatedSearches: [],
      }),
    }));

    router = (await import("../../src/server/routes/search")).default;
  });

  afterAll(async () => {
    mock.module(HANDLERS_MOD, () => handlersReal);
    await updateInstanceSettings(saved);
  });

  test("falls back to the query format when the form has none", async () => {
    const res = await formPost("http://localhost/api/search?format=json", {
      q: "rust lifetimes",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.query).toBe("rust lifetimes");
    expect(Array.isArray(body.unresponsive_engines)).toBe(true);
    expect(body.results[0].parsed_url[1]).toBe("doc.rust-lang.org");
  });

  test("keeps the form format ahead of the query format", async () => {
    const res = await formPost("http://localhost/api/search?format=json", {
      q: "rust lifetimes",
      format: "html",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.unresponsive_engines).toBeUndefined();
    expect(body.results[0].content).toBe(FAKE_RESULT.snippet);
  });
});
