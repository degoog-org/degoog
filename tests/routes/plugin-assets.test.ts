import { describe, test, expect, beforeAll } from "bun:test";

let pluginAssetsRouter: {
  request: (req: Request | string) => Response | Promise<Response>;
};

beforeAll(async () => {
  const mod = await import("../../src/server/routes/plugin-assets");
  pluginAssetsRouter = mod.default;
});

describe("routes/plugin-assets", () => {
  test("GET /plugins/folder/.. returns 404", async () => {
    const res = await pluginAssetsRouter.request(
      "http://localhost/plugins/somefolder/../script.js",
    );
    expect(res.status).toBe(404);
  });

  test("GET /plugins/nonexistent/file.js returns 404", async () => {
    const res = await pluginAssetsRouter.request(
      "http://localhost/plugins/nonexistent/file.js",
    );
    expect(res.status).toBe(404);
  });

  test("GET encoded traversal in rest returns 404", async () => {
    const res = await pluginAssetsRouter.request(
      "http://localhost/plugins/somefolder/%2e%2e%2f%2e%2e%2fpackage.json",
    );
    expect(res.status).toBe(404);
  });

  test("GET themes encoded traversal returns 404", async () => {
    const res = await pluginAssetsRouter.request(
      "http://localhost/themes/somefolder/%2e%2e%2fpackage.json",
    );
    expect(res.status).toBe(404);
  });
});

describe("resolveContained", () => {
  test("rejects parent-escape attempts", async () => {
    const { resolveContained } = await import("../../src/server/utils/paths");
    expect(resolveContained("/srv/data", "plugin", "ok.js")).toBe(
      "/srv/data/plugin/ok.js",
    );
    expect(resolveContained("/srv/data", "..", "secret")).toBeNull();
    expect(
      resolveContained("/srv/data", "plugin", "../../etc/passwd"),
    ).toBeNull();
    expect(resolveContained("/srv/data", "/etc", "passwd")).toBeNull();
  });
});
