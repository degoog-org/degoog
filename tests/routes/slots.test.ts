import { describe, test, expect, beforeAll } from "bun:test";

let slotsRouter: {
  request: (req: Request | string) => Response | Promise<Response>;
};

beforeAll(async () => {
  const mod = await import("../../src/server/routes/search/slots");
  slotsRouter = mod.default;
});

describe("routes/slots", () => {
  test("POST /api/slots without query returns 200 with empty panels", async () => {
    const req = new Request("http://localhost/api/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const res = await slotsRouter.request(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ panels: [] });
  });

  test("POST /api/slots/glance without body returns 400", async () => {
    const req = new Request("http://localhost/api/slots/glance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const res = await slotsRouter.request(req);
    expect(res.status).toBe(400);
  });
});
