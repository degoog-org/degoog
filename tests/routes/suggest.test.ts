import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import { getServerKeyHex, initServerKey } from "../../src/server/utils/security/server-key";
import { clear as clearServerCache } from "../../src/server/utils/cache/cache";

const REGISTRY_MOD = "../../src/server/extensions/autocomplete/registry";

const registryReal = { ...(await import(REGISTRY_MOD)) };
const providerCalls: string[] = [];

mock.module(REGISTRY_MOD, () => ({
  ...registryReal,
  getSuggestionsFromProviders: async (query: string) => {
    providerCalls.push(query);
    return [{ text: `${query} one`, source: "stub" }];
  },
}));

let suggestRouter: {
  request: (req: Request | string) => Response | Promise<Response>;
};

beforeAll(async () => {
  await initServerKey();
  const mod = await import("../../src/server/routes/search/suggest");
  suggestRouter = mod.default;
});

afterAll(() => {
  mock.module(REGISTRY_MOD, () => registryReal);
});

const _authHeaders = (): Record<string, string> => {
  const key = getServerKeyHex();
  if (!key) throw new Error("server key not loaded");
  return { Authorization: `Bearer ${key}` };
};

const _getOpenSearch = (search: string): Promise<Response> =>
  Promise.resolve(
    suggestRouter.request(
      new Request(`http://localhost/api/suggest/opensearch${search}`, {
        headers: _authHeaders(),
      }),
    ),
  );

describe("routes/suggest", () => {
  test("GET /api/suggest/opensearch returns 200 and [query, suggestions]", async () => {
    clearServerCache();
    providerCalls.length = 0;
    const res = await _getOpenSearch("?q=foo");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain(
      "application/x-suggestions",
    );
    const body = await res.json();
    expect(body).toEqual(["foo", ["foo one"]]);
    expect(providerCalls).toEqual(["foo"]);
  });

  test("GET /api/suggest/opensearch skips providers on empty or blank q", async () => {
    providerCalls.length = 0;
    for (const [search, echoed] of [
      ["", ""],
      ["?q=", ""],
      ["?q=%20%20", "  "],
    ]) {
      const res = await _getOpenSearch(search);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain(
        "application/x-suggestions",
      );
      expect(await res.json()).toEqual([echoed, []]);
    }
    expect(providerCalls).toEqual([]);
  });
});
