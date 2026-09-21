import { describe, test, expect, beforeAll } from "bun:test";

let themesRouter: {
  request: (req: Request | string) => Response | Promise<Response>;
};

beforeAll(async () => {
  const { initThemes } =
    await import("../../src/server/extensions/themes/registry");
  const orig = process.env.DEGOOG_THEMES_DIR;
  process.env.DEGOOG_THEMES_DIR = "/nonexistent-themes-dir";
  await initThemes();
  if (orig !== undefined) process.env.DEGOOG_THEMES_DIR = orig;
  else delete process.env.DEGOOG_THEMES_DIR;
  const mod = await import("../../src/server/routes/themes");
  themesRouter = mod.default;
});

describe("routes/themes", () => {
  test("GET /api/themes returns 200 and themes array", async () => {
    const res = await themesRouter.request("http://localhost/api/themes");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.themes)).toBe(true);
  });
});
