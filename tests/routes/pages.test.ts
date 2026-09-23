import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { initServerKey } from "../../src/server/utils/security/server-key";

let pagesRouter: {
  request: (req: Request | string) => Response | Promise<Response>;
};

let savedPublic: string | undefined;
let savedSettingsPath: string | undefined;

beforeAll(async () => {
  savedPublic = process.env.DEGOOG_PUBLIC_INSTANCE;
  savedSettingsPath = process.env.DEGOOG_SETTINGS_PATH;

  delete process.env.DEGOOG_PUBLIC_INSTANCE;
  delete process.env.DEGOOG_SETTINGS_PATH;

  await initServerKey();
  const mod = await import(
    `../../src/server/routes/pages?pages-test=${Date.now()}`
  );
  pagesRouter = mod.default;
});

afterAll(() => {
  if (savedPublic !== undefined)
    process.env.DEGOOG_PUBLIC_INSTANCE = savedPublic;
  else delete process.env.DEGOOG_PUBLIC_INSTANCE;
  if (savedSettingsPath !== undefined)
    process.env.DEGOOG_SETTINGS_PATH = savedSettingsPath;
  else delete process.env.DEGOOG_SETTINGS_PATH;
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
