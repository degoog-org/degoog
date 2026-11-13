import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

const SEARCH_UTILS_MOD = "../../src/server/utils/search";
const searchUtilsReal = { ...(await import(SEARCH_UTILS_MOD)) };

let buckets: { bucket: string; scale: number }[] = [];

let router: { request: (req: Request | string, init?: RequestInit) => Response | Promise<Response> };

beforeAll(async () => {
  mock.module(SEARCH_UTILS_MOD, () => ({
    ...searchUtilsReal,
    _applyRateLimit: async (_c: unknown, bucket = "", scale = 1) => {
      buckets.push({ bucket, scale });
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

const post = (path: string, body: unknown, accept?: string) =>
  router.request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accept ? { Accept: accept } : {}),
    },
    body: JSON.stringify(body),
  });

describe("slot routes rate limiting", () => {
  test("every slot call a search makes shares one bucket, apart from the search one, sized for all of them", async () => {
    await post("/api/slots", { query: "berlin" });
    await post("/api/slots/glance", { query: "berlin" });
    await post("/api/slots", { query: "berlin", results: [] });
    await post("/api/slots/glance", { query: "berlin", results: [] });
    expect(buckets).toHaveLength(4);
    expect(new Set(buckets.map((b) => b.bucket))).toEqual(new Set(["slots:"]));
    for (const { scale } of buckets) expect(scale).toBe(4);
  });

  test("streamed slot calls draw from the same bucket as the JSON ones", async () => {
    for (const path of ["/api/slots", "/api/slots/glance"]) {
      const res = await post(path, { query: "berlin" }, "text/event-stream");
      expect(res.status).toBe(200);
      await res.text();
    }
    expect(buckets).toEqual([
      { bucket: "slots:", scale: 4 },
      { bucket: "slots:", scale: 4 },
    ]);
  });

  test("malformed bodies still count against the limit", async () => {
    for (const path of ["/api/slots", "/api/slots/glance"]) {
      const res = await router.request(`http://localhost${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not json",
      });
      expect(res.status).toBe(400);
    }
    expect(buckets).toHaveLength(2);
  });
});
