import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

const INSTALL_MOD = "../../src/server/extensions/compatibility-layer/searx/install";
const SEARX_MOD = "../../src/server/extensions/compatibility-layer/searx";
const RELOAD_MOD = "../../src/server/extensions/store/reload-sync";

const installReal = { ...(await import(INSTALL_MOD)) };
const searxReal = { ...(await import(SEARX_MOD)) };
const reloadReal = { ...(await import(RELOAD_MOD)) };
const savedNoPassword = process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD;

const log: string[] = [];
let failWith: unknown = null;

let router: { request: (req: Request) => Response | Promise<Response> };

const post = (path: string, body: unknown): Promise<Response> =>
  Promise.resolve(
    router.request(
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ),
  );

const action = (name: string) => async (code: string) => {
  log.push(`${name}:${code}`);
  if (failWith !== null) throw failWith;
};

beforeAll(async () => {
  process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD = "true";
  mock.module(INSTALL_MOD, () => ({
    ...installReal,
    installSearx: action("install"),
    updateSearx: action("update"),
    uninstallSearx: action("uninstall"),
    withSearxLock: async <T>(task: () => Promise<T>) => {
      log.push("lock");
      const out = await task();
      log.push("unlock");
      return out;
    },
  }));
  mock.module(SEARX_MOD, () => ({ ...searxReal, isSearxCompatOn: async () => true }));
  mock.module(RELOAD_MOD, () => ({
    ...reloadReal,
    reloadSync: async () => {
      log.push("reload");
    },
  }));
  router = (await import("../../src/server/routes/extensions/searx-engines")).default;
});

afterAll(() => {
  mock.module(INSTALL_MOD, () => installReal);
  mock.module(SEARX_MOD, () => searxReal);
  mock.module(RELOAD_MOD, () => reloadReal);
  if (savedNoPassword === undefined) delete process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD;
  else process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD = savedNoPassword;
});

beforeEach(() => {
  log.length = 0;
  failWith = null;
});

describe("searx engine routes", () => {
  for (const name of ["install", "update", "uninstall"]) {
    test(`${name} runs its action and a reload inside the lock`, async () => {
      const res = await post(`/api/searx/${name}`, { code: "  bing  " });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(log).toEqual(["lock", `${name}:bing`, "reload", "unlock"]);
    });
  }

  test("a missing code is refused before anything runs", async () => {
    const res = await post("/api/searx/install", {});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing code" });
    expect(log).toEqual([]);
  });

  test("failures answer 400 with the error, or a per-action fallback", async () => {
    failWith = new Error("boom");
    expect(await (await post("/api/searx/update", { code: "x" })).json()).toEqual({ error: "boom" });
    failWith = "not an error";
    expect(await (await post("/api/searx/install", { code: "x" })).json()).toEqual({ error: "Install failed" });
    expect(await (await post("/api/searx/update", { code: "x" })).json()).toEqual({ error: "Update failed" });
    const res = await post("/api/searx/uninstall", { code: "x" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Uninstall failed" });
  });
});
