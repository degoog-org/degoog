import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { initServerKey } from "../../src/server/utils/server-key";

type Router = {
  request: (req: Request | string) => Response | Promise<Response>;
};

const CORRECT_PASSWORD = "pentest-secret-pw-77x";

let pagesRouter: Router;
let authRouter: Router;
let settingsRouter: Router;

let savedPublic: string | undefined;
let savedPasswords: string | undefined;

beforeAll(async () => {
  savedPublic = process.env.DEGOOG_PUBLIC_INSTANCE;
  savedPasswords = process.env.DEGOOG_SETTINGS_PASSWORDS;

  process.env.DEGOOG_PUBLIC_INSTANCE = "true";
  process.env.DEGOOG_SETTINGS_PASSWORDS = CORRECT_PASSWORD;

  await initServerKey();

  const [pagesMod, authMod, settingsMod] = await Promise.all([
    import("../../src/server/routes/pages"),
    import("../../src/server/routes/settings-auth"),
    import("../../src/server/routes/settings"),
  ]);

  pagesRouter = pagesMod.default;
  authRouter = authMod.default;
  settingsRouter = settingsMod.default;
});

afterAll(() => {
  if (savedPublic !== undefined) process.env.DEGOOG_PUBLIC_INSTANCE = savedPublic;
  else delete process.env.DEGOOG_PUBLIC_INSTANCE;
  if (savedPasswords !== undefined)
    process.env.DEGOOG_SETTINGS_PASSWORDS = savedPasswords;
  else delete process.env.DEGOOG_SETTINGS_PASSWORDS;
});

const authPost = (password: string, ip: string) =>
  authRouter.request(
    new Request("http://localhost/api/settings/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-real-ip": ip },
      body: JSON.stringify({ password }),
    }),
  );

const apiGet = (path: string, token?: string) =>
  settingsRouter.request(
    new Request(`http://localhost${path}`, {
      headers: token ? { "x-settings-token": token } : {},
    }),
  );

describe("public instance — no password", () => {
  beforeAll(() => {
    delete process.env.DEGOOG_SETTINGS_PASSWORDS;
  });

  afterAll(() => {
    process.env.DEGOOG_SETTINGS_PASSWORDS = CORRECT_PASSWORD;
  });

  test("GET /settings returns 200 with public settings HTML", async () => {
    const res = await pagesRouter.request("http://localhost/settings");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("settings-page");
  });

  test("GET /admin returns 404 — does not reveal admin exists", async () => {
    const res = await pagesRouter.request("http://localhost/admin");
    expect(res.status).toBe(404);
  });

  test("GET /admin/:tab returns 404", async () => {
    const res = await pagesRouter.request("http://localhost/admin/general");
    expect(res.status).toBe(404);
  });

  test("public settings HTML has no reference to the admin path", async () => {
    const res = await pagesRouter.request("http://localhost/settings");
    const html = await res.text();
    expect(html).not.toContain("/admin");
  });

  test("GET /api/settings/general returns 401 without token", async () => {
    const res = await apiGet("/api/settings/general");
    expect(res.status).toBe(401);
  });

  test("POST /api/settings/auth returns 401 on public instance with no password", async () => {
    const res = await authPost("anything", "10.1.0.1");
    expect(res.status).toBe(401);
  });
});

describe("public instance — password set", () => {
  test("GET /settings still returns public settings HTML", async () => {
    const res = await pagesRouter.request("http://localhost/settings");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("settings-page");
  });

  test("public settings HTML has no reference to the admin path even with password set", async () => {
    const res = await pagesRouter.request("http://localhost/settings");
    const html = await res.text();
    expect(html).not.toContain("/admin");
  });

  test("GET /admin returns 200 and shows the auth gate", async () => {
    const res = await pagesRouter.request("http://localhost/admin");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("settings-auth");
  });

  test("POST /api/settings/auth with wrong password returns 401", async () => {
    const res = await authPost("wrongpassword", "10.2.0.1");
    expect(res.status).toBe(401);
  });

  test("POST /api/settings/auth brute force triggers 429 after threshold", async () => {
    const ip = "10.3.0.99";
    const attempts = Array.from({ length: 10 }, () =>
      authPost("badpass", ip),
    );
    const results = await Promise.all(attempts);
    for (const r of results) {
      expect([401, 429]).toContain(r.status);
    }
    const blocked = await authPost("badpass", ip);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).not.toBeNull();
  });

  test("POST /api/settings/auth with correct password returns token and sets secure cookie", async () => {
    const res = await authPost(CORRECT_PASSWORD, "10.4.0.1");
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; token: string };
    expect(body.ok).toBe(true);
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(0);
    const cookie = res.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
  });

  test("valid token grants access to protected API routes", async () => {
    const authRes = await authPost(CORRECT_PASSWORD, "10.5.0.1");
    const { token } = await authRes.json() as { ok: boolean; token: string };
    const res = await apiGet("/api/settings/general", token);
    expect(res.status).toBe(200);
  });

  test("tampered token returns 401", async () => {
    const authRes = await authPost(CORRECT_PASSWORD, "10.6.0.1");
    const { token } = await authRes.json() as { ok: boolean; token: string };
    const tampered = token.slice(0, -4) + "0000";
    const res = await apiGet("/api/settings/general", tampered);
    expect(res.status).toBe(401);
  });

  test("random garbage token returns 401", async () => {
    const res = await apiGet("/api/settings/general", "notavalidtoken");
    expect(res.status).toBe(401);
  });

  test("GET /api/settings/auth without token reports valid: false", async () => {
    const res = await authRouter.request("http://localhost/api/settings/auth");
    expect(res.status).toBe(200);
    const body = await res.json() as { required: boolean; valid: boolean };
    expect(body.required).toBe(true);
    expect(body.valid).toBe(false);
  });

  test("GET /api/settings/auth with valid token reports valid: true", async () => {
    const authRes = await authPost(CORRECT_PASSWORD, "10.7.0.1");
    const { token } = await authRes.json() as { ok: boolean; token: string };
    const res = await authRouter.request(
      new Request("http://localhost/api/settings/auth", {
        headers: { "x-settings-token": token },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { required: boolean; valid: boolean };
    expect(body.required).toBe(true);
    expect(body.valid).toBe(true);
  });

  test("POST /api/settings/general without token returns 401", async () => {
    const res = await settingsRouter.request(
      new Request("http://localhost/api/settings/general", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(401);
  });
});
