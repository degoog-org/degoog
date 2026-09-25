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
  const mod = await import("../../src/server/routes/extensions/themes");
  themesRouter = mod.default;
});

describe("routes/themes", () => {
  test("GET /api/themes returns 200 and themes array", async () => {
    const res = await themesRouter.request("http://localhost/api/themes");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.themes)).toBe(true);
  });

  test("POST /api/theme/active refuses a body that is not a JSON object", async () => {
    const prior = process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD;
    process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD = "true";
    try {
      for (const body of ["{ not json", "[]", "null"]) {
        const res = await themesRouter.request(
          new Request("http://localhost/api/theme/active", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          }),
        );
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "Invalid JSON" });
      }
    } finally {
      if (prior === undefined) delete process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD;
      else process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD = prior;
    }
  });
});
