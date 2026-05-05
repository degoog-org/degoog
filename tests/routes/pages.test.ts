import { describe, test, expect, beforeAll } from "bun:test";
import { initServerKey } from "../../src/server/utils/server-key";

let pagesRouter: {
  request: (req: Request | string) => Response | Promise<Response>;
};

beforeAll(async () => {
  await initServerKey();
  const mod = await import("../../src/server/routes/pages");
  pagesRouter = mod.default;
});

describe("routes/pages", () => {
  test("GET / returns 200 and HTML", async () => {
    const res = await pagesRouter.request("http://localhost/");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
  });

  test("GET /?q=foo redirects to /search", async () => {
    const res = await pagesRouter.request("http://localhost/?q=foo");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("/search");
  });

  test("GET /search returns 200 and HTML", async () => {
    const res = await pagesRouter.request("http://localhost/search");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });
});
