import { describe, test, expect, beforeAll, afterAll } from "bun:test";

type Router = {
  request: (req: Request | string) => Response | Promise<Response>;
};

let router: Router;
let savedEnabled: string | undefined;

beforeAll(async () => {
  savedEnabled = process.env.DEGOOG_PUBLIC_INSTANCE;
  delete process.env.DEGOOG_SETTINGS_PASSWORDS;
  const mod = await import("../../src/server/routes/honeypot");
  router = mod.default;
});

afterAll(() => {
  if (savedEnabled !== undefined)
    process.env.DEGOOG_PUBLIC_INSTANCE = savedEnabled;
  else delete process.env.DEGOOG_PUBLIC_INSTANCE;
});

describe("honeypot traps — enabled (default)", () => {
  test("GET /wp-login.php returns 200 with fake WordPress HTML", async () => {
    const res = await router.request("http://localhost/wp-login.php");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("loginform");
  });

  test("GET /.env returns 200 with fake env file", async () => {
    const res = await router.request("http://localhost/.env");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("DB_PASSWORD");
  });

  test("GET /.git/config returns 200 with fake git config", async () => {
    const res = await router.request("http://localhost/.git/config");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("[remote");
  });

  test("GET /package.json returns 200 with fake package.json", async () => {
    const res = await router.request("http://localhost/package.json");
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string };
    expect(typeof body.name).toBe("string");
  });

  test("GET /Dockerfile returns 200 with fake Dockerfile", async () => {
    const res = await router.request("http://localhost/Dockerfile");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("FROM node");
  });

  test("GET /server.js returns 200 with fake server file", async () => {
    const res = await router.request("http://localhost/server.js");
    expect(res.status).toBe(200);
    const ct = res.headers.get("Content-Type") ?? "";
    expect(ct).toContain("javascript");
  });

  test("GET /api/degoog-search returns 200 with Catullus JSON", async () => {
    const res = await router.request("http://localhost/api/degoog-search");
    expect(res.status).toBe(200);
    const body = await res.json() as { results: unknown[] };
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
  });

  test("GET /api/supersearch returns fake results", async () => {
    const res = await router.request("http://localhost/api/supersearch");
    expect(res.status).toBe(200);
  });

  test("GET /api/allengines returns fake results", async () => {
    const res = await router.request("http://localhost/api/allengines");
    expect(res.status).toBe(200);
  });

  test("GET /sitemap.xml returns XML containing trap paths", async () => {
    const res = await router.request("http://localhost/sitemap.xml");
    expect(res.status).toBe(200);
    const ct = res.headers.get("Content-Type") ?? "";
    expect(ct).toContain("xml");
    const body = await res.text();
    expect(body).toContain("<urlset");
    expect(body).toContain("/wp-login.php");
    expect(body).toContain("/.env");
    expect(body).toContain("/package.json");
    expect(body).toContain("/api/degoog-search");
  });

  test("sitemap.xml only contains honeypot paths — no real app routes", async () => {
    const res = await router.request("http://localhost/sitemap.xml");
    const body = await res.text();
    expect(body).not.toContain("<loc>/search</loc>");
    expect(body).not.toContain("<loc>/settings</loc>");
  });

  test("POST to trap path also blocks", async () => {
    const res = await router.request(
      new Request("http://localhost/wp-login.php", { method: "POST" }),
    );
    expect(res.status).toBe(200);
  });
});

describe("honeypot traps — disabled", () => {
  beforeAll(async () => {
    const { setSettings, getSettings } = await import(
      "../../src/server/utils/plugin-settings"
    );
    const { syncBlocklist } = await import("../../src/server/utils/bot-trap");
    const existing = await getSettings("degoog-settings");
    await setSettings("degoog-settings", {
      ...existing,
      honeypotEnabled: "false",
    });
    await syncBlocklist();
  });

  afterAll(async () => {
    const { setSettings, getSettings } = await import(
      "../../src/server/utils/plugin-settings"
    );
    const { syncBlocklist } = await import("../../src/server/utils/bot-trap");
    const existing = await getSettings("degoog-settings");
    await setSettings("degoog-settings", {
      ...existing,
      honeypotEnabled: "true",
    });
    await syncBlocklist();
  });

  test("GET /wp-login.php returns 404 when disabled", async () => {
    const res = await router.request("http://localhost/wp-login.php");
    expect(res.status).toBe(404);
  });

  test("GET /sitemap.xml returns 404 when disabled", async () => {
    const res = await router.request("http://localhost/sitemap.xml");
    expect(res.status).toBe(404);
  });

  test("GET /.env returns 404 when disabled", async () => {
    const res = await router.request("http://localhost/.env");
    expect(res.status).toBe(404);
  });
});
