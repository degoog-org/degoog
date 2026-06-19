import { describe, test, expect, beforeAll } from "bun:test";

let extensionsRouter: {
  request: (req: Request | string) => Response | Promise<Response>;
};

beforeAll(async () => {
  const mod = await import("../../src/server/routes/extensions");
  extensionsRouter = mod.default;
});

describe("routes/extensions", () => {
  test("GET /api/extensions returns 200 and engines, plugins, themes", async () => {
    const res = await extensionsRouter.request(
      "http://localhost/api/extensions",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("engines");
    expect(body).toHaveProperty("plugins");
    expect(body).toHaveProperty("themes");
    expect(Array.isArray(body.engines)).toBe(true);
  });

  test("GET /api/extensions?type=engine returns only engines", async () => {
    const res = await extensionsRouter.request(
      "http://localhost/api/extensions?type=engine",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("engines");
    expect(body).not.toHaveProperty("plugins");
    expect(body).not.toHaveProperty("themes");
    expect(Array.isArray(body.engines)).toBe(true);
  });

  test("GET /api/extensions?type=bogus returns 400", async () => {
    const res = await extensionsRouter.request(
      "http://localhost/api/extensions?type=bogus",
    );
    expect(res.status).toBe(400);
  });

  test("GET /api/plugins/styles.css returns 200", async () => {
    const res = await extensionsRouter.request(
      "http://localhost/api/plugins/styles.css",
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/css");
  });
});
