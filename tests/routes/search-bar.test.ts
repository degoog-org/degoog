import { describe, test, expect, beforeAll } from "bun:test";

let searchBarRouter: {
  request: (req: Request | string) => Response | Promise<Response>;
};

beforeAll(async () => {
  const { initSearchBarActions } =
    await import("../../src/server/extensions/search-bar/registry");
  const orig = process.env.DEGOOG_PLUGINS_DIR;
  process.env.DEGOOG_PLUGINS_DIR = "/nonexistent-plugins-dir";
  await initSearchBarActions();
  if (orig !== undefined) process.env.DEGOOG_PLUGINS_DIR = orig;
  else delete process.env.DEGOOG_PLUGINS_DIR;
  const mod = await import("../../src/server/routes/search-bar");
  searchBarRouter = mod.default;
});

describe("routes/search-bar", () => {
  test("GET /api/search-bar/actions returns 200 and actions", async () => {
    const res = await searchBarRouter.request(
      "http://localhost/api/search-bar/actions",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.actions)).toBe(true);
  });
});
