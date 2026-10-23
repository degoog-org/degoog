import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

const SEARCH_UTILS_MOD = "../../src/server/utils/search";
const searchUtilsReal = { ...(await import(SEARCH_UTILS_MOD)) };

let buckets: string[] = [];

let router: { request: (req: Request | string, init?: RequestInit) => Response | Promise<Response> };

beforeAll(async () => {
  mock.module(SEARCH_UTILS_MOD, () => ({
    ...searchUtilsReal,
    _applyRateLimit: async (_c: unknown, bucket = "") => {
      buckets.push(bucket);
      return null;
    },
  }));
  router = (await import("../../src/server/routes/search/slots")).default;
});

afterAll(() => {
  mock.module(SEARCH_UTILS_MOD, () => searchUtilsReal);
});

beforeEach(() => {
  buckets = [];
});

const post = (path: string, body: unknown) =>
  router.request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("slot routes rate limiting", () => {
  test("every slot call a search makes gets its own bucket, apart from the search one", async () => {
    await post("/api/slots", { query: "berlin" });
    await post("/api/slots/glance", { query: "berlin" });
    await post("/api/slots", { query: "berlin", results: [] });
    await post("/api/slots/glance", { query: "berlin", results: [] });
    expect(buckets).toHaveLength(4);
    expect(buckets).not.toContain("");
    expect(new Set(buckets).size).toBe(4);
  });

  test("repeat calls of the same kind share a bucket", async () => {
    await post("/api/slots", { query: "berlin" });
    await post("/api/slots", { query: "rome" });
    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toBe(buckets[1]);
  });
});
