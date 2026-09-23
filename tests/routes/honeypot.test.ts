import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { updateInstanceSettings } from "../../src/server/utils/settings/server-settings";
import { syncBlocklist } from "../../src/server/utils/security/bot-trap";

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

describe("honeypot traps - enabled (default)", () => {
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

  test("GET /api/degoog-search returns 200 with Catullus JSON", async () => {
    const res = await router.request("http://localhost/api/degoog-search");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: unknown[] };
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
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

describe("honeypot traps - disabled", () => {
  beforeAll(async () => {
    await updateInstanceSettings({ honeypotEnabled: "false" });
    await syncBlocklist();
  });

  afterAll(async () => {
    await updateInstanceSettings({ honeypotEnabled: "true" });
    await syncBlocklist();
  });

  test("GET /wp-login.php returns 404 when disabled", async () => {
    const res = await router.request("http://localhost/wp-login.php");
    expect(res.status).toBe(404);
  });
});
