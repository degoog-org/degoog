import { describe, test, expect, beforeAll } from "bun:test";

let commandsRouter: { request: (req: Request | string) => Response | Promise<Response> };

beforeAll(async () => {
  const { initPlugins } = await import("../../src/commands/registry");
  const orig = process.env.DEGOOG_PLUGINS_DIR;
  process.env.DEGOOG_PLUGINS_DIR = "/nonexistent-plugins-dir";
  await initPlugins();
  if (orig !== undefined) process.env.DEGOOG_PLUGINS_DIR = orig;
  else delete process.env.DEGOOG_PLUGINS_DIR;
  const mod = await import("../../src/routes/commands");
  commandsRouter = mod.default;
});

describe("routes/commands", () => {
  test("GET /api/commands returns 200 and commands with naturalLanguage", async () => {
    const res = await commandsRouter.request("http://localhost/api/commands");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(expect.objectContaining({ commands: expect.any(Array) }));
    expect(body.commands.length).toBeGreaterThan(0);
    expect(body.commands[0]).toEqual(expect.objectContaining({
      trigger: expect.any(String),
      name: expect.any(String),
      naturalLanguage: expect.any(Boolean),
    }));
  });

  test("GET /api/command without q returns 400", async () => {
    const res = await commandsRouter.request("http://localhost/api/command");
    expect(res.status).toBe(400);
  });
});
