import { describe, test, expect, beforeAll } from "bun:test";

let pluginAssetsRouter: {
  request: (req: Request | string) => Response | Promise<Response>;
};

beforeAll(async () => {
  const mod = await import("../../src/server/routes/plugin-assets");
  pluginAssetsRouter = mod.default;
});

describe("routes/plugin-assets", () => {
  test("GET /plugins/nonexistent/file.js returns 404", async () => {
    const res = await pluginAssetsRouter.request(
      "http://localhost/plugins/nonexistent/file.js",
    );
    expect(res.status).toBe(404);
  });

  test("encoded traversal returns 404 for plugins and themes alike", async () => {
    for (const path of [
      "/plugins/somefolder/%2e%2e%2f%2e%2e%2fpackage.json",
      "/themes/somefolder/%2e%2e%2fpackage.json",
    ]) {
      const res = await pluginAssetsRouter.request(`http://localhost${path}`);
      expect(res.status).toBe(404);
    }
  });
});
