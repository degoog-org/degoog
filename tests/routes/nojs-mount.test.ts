import { afterAll, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { build404 } from "../../src/server/routes/pages";
import { getLocale } from "../../src/server/utils/hono";

const SERVER_SETTINGS_MOD = "../../src/server/utils/settings/server-settings";
const BOT_TRAP_MOD = "../../src/server/utils/security/bot-trap";
const REQUEST_MOD = "../../src/server/utils/net/request";

const serverSettingsReal = { ...(await import(SERVER_SETTINGS_MOD)) };
const botTrapReal = { ...(await import(BOT_TRAP_MOD)) };
const requestReal = { ...(await import(REQUEST_MOD)) };

let nojsEnabled = "false";
let blocked = false;

mock.module(SERVER_SETTINGS_MOD, () => ({
  ...serverSettingsReal,
  getInstanceSettings: async () => ({ nojsEnabled }),
}));
mock.module(BOT_TRAP_MOD, () => ({
  ...botTrapReal,
  isBlocked: async () => blocked,
  cssCheckOn: async () => false,
}));
mock.module(REQUEST_MOD, () => ({
  ...requestReal,
  getClientIp: () => "10.1.2.3",
}));

const status = async (path: string): Promise<number> => {
  const globalRouter = (await import("../../src/server/routes")).default;
  const res = await globalRouter.request(`http://localhost${path}`);
  return res.status;
};

afterAll(() => {
  mock.module(SERVER_SETTINGS_MOD, () => serverSettingsReal);
  mock.module(BOT_TRAP_MOD, () => botTrapReal);
  mock.module(REQUEST_MOD, () => requestReal);
});

describe("nojs is mounted on the global router", () => {
  test("turning nojsEnabled on and off needs no restart", async () => {
    blocked = false;
    nojsEnabled = "false";
    expect(await status("/nojs")).toBe(404);
    nojsEnabled = "true";
    expect(await status("/nojs")).toBe(200);
    nojsEnabled = "false";
    expect(await status("/nojs")).toBe(404);
  });

  test("a switched off nojs is indistinguishable from an unknown path", async () => {
    blocked = false;
    nojsEnabled = "false";
    const globalRouter = (await import("../../src/server/routes")).default;
    const app = new Hono();
    app.route("/", globalRouter);
    app.notFound(async (c) => c.html(await build404(getLocale(c)), 404));

    const off = await app.request("http://localhost/nojs");
    const nowhere = await app.request("http://localhost/purple-elephant");
    expect(off.status).toBe(nowhere.status);
    expect([...off.headers.entries()].sort()).toEqual(
      [...nowhere.headers.entries()].sort(),
    );
    expect(await off.text()).toBe(await nowhere.text());
  });

  test("a banned visitor is refused before nojs ever answers", async () => {
    nojsEnabled = "true";
    blocked = true;
    expect(await status("/nojs")).toBe(403);
    expect(await status("/nojs/search?q=hello")).toBe(403);
    blocked = false;
  });
});
