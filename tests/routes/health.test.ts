import { describe, test, expect, beforeAll } from "bun:test";

let healthRouter: {
  request: (req: Request | string) => Response | Promise<Response>;
};
let markReady: () => void;

beforeAll(async () => {
  const mod = await import("../../src/server/routes/health");
  healthRouter = mod.default;
  markReady = mod.markReady;
});

describe("routes/health", () => {
  test("GET /healthz returns 200 ok", async () => {
    const res = await healthRouter.request("http://localhost/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("GET /readyz reflects readiness state", async () => {
    const before = await healthRouter.request("http://localhost/readyz");
    expect([200, 503]).toContain(before.status);

    markReady();
    const after = await healthRouter.request("http://localhost/readyz");
    expect(after.status).toBe(200);
    expect(await after.json()).toEqual({ ok: true });
  });
});
