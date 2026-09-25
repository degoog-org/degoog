import { describe, test, expect, beforeAll } from "bun:test";

let pluginRoutesRouter: {
  request: (req: Request | string) => Response | Promise<Response>;
};

beforeAll(async () => {
  const mod = await import("../../src/server/routes/extensions/plugin-routes");
  pluginRoutesRouter = mod.default;
});

describe("routes/plugin-routes", () => {
  test("GET /api/plugin/unknown/some path returns 404", async () => {
    const res = await pluginRoutesRouter.request(
      "http://localhost/api/plugin/unknown-plugin-id/some",
    );
    expect(res.status).toBe(404);
  });
});
