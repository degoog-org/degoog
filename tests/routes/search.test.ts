import { describe, test, expect, beforeAll } from "bun:test";

let searchRouter: {
  request: (req: Request | string) => Response | Promise<Response>;
};

beforeAll(async () => {
  const mod = await import("../../src/server/routes/search");
  searchRouter = mod.default;
});

describe("routes/search", () => {
  test("GET /api/search without q returns 400", async () => {
    const res = await searchRouter.request(
      "http://localhost/api/search?google=true",
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("query");
  });

  test("POST /api/slots without query returns 200 with empty panels", async () => {
    const req = new Request("http://localhost/api/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const res = await searchRouter.request(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ panels: [] });
  });

  test("GET /api/lucky without q returns 400", async () => {
    const res = await searchRouter.request("http://localhost/api/lucky");
    expect(res.status).toBe(400);
  });

  test("POST /api/slots/glance without body returns 400", async () => {
    const req = new Request("http://localhost/api/slots/glance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const res = await searchRouter.request(req);
    expect(res.status).toBe(400);
  });

  test("POST /api/slots/glance with query and results returns 200 and panels", async () => {
    const req = new Request("http://localhost/api/slots/glance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "test",
        results: [
          {
            title: "T",
            url: "https://example.com",
            snippet: "S",
            score: 1,
            sources: ["x"],
          },
        ],
      }),
    });
    const res = await searchRouter.request(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(
      expect.objectContaining({ panels: expect.any(Array) }),
    );
  });
});
