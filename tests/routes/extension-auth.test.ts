import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { isolateRouteEnv } from "../helpers/route-modules";
import type { PluginRouteContext, SlotPlugin, SlotPluginContext } from "../../src/server/types/extension";
import { SlotPanelPosition } from "../../src/shared/search-types";

const SLOTS_MOD = "../../src/server/extensions/slots/registry";
const slotsReal = { ...(await import(SLOTS_MOD)) };

const PASSWORD = "mellon";
const PLUGIN_FOLDER = "gate-probe";

let seenByRoute: PluginRouteContext[] = [];
let seenBySlot: (SlotPluginContext | undefined)[] = [];

const PROBE_SLOT: SlotPlugin = {
  id: "gate-probe-slot",
  settingsId: "gate-probe-slot",
  name: "gate probe",
  description: "gate probe",
  position: SlotPanelPosition.KnowledgePanel,
  trigger: () => true,
  execute: async (_query, context) => {
    seenBySlot.push(context);
    return { html: "<p>probe</p>" };
  },
};

const _record = (_req: Request, context: PluginRouteContext): Response => {
  seenByRoute.push(context);
  return Response.json({ ok: true });
};

let app: Hono;
let token = "";
let restoreEnv = (): void => {};

beforeAll(async () => {
  restoreEnv = isolateRouteEnv("degoog-extension-auth-", {
    DEGOOG_SETTINGS_PASSWORDS: PASSWORD,
  });
  mock.module(SLOTS_MOD, () => ({ ...slotsReal, getSlotPlugins: () => [PROBE_SLOT] }));
  const { registerPluginRoutesFromModule } = await import(
    "../../src/server/extensions/plugin-routes/registry"
  );
  await registerPluginRoutesFromModule(PLUGIN_FOLDER, `/nonexistent/${PLUGIN_FOLDER}`, {
    routes: [
      { method: "get", path: "/secret", auth: true, handler: _record },
      { method: "get", path: "/open", handler: _record },
    ],
  });
  app = new Hono();
  app.route("/", (await import("../../src/server/routes/settings/settings-auth")).default);
  app.route("/", (await import("../../src/server/routes/extensions/plugin-routes")).default);
  app.route("/", (await import("../../src/server/routes/search/slots")).default);
  await (await import("../../src/server/utils/security/server-key")).initServerKey();
  app.route("/", (await import("../../src/server/routes/pages/pages")).default);
  const login = await app.request("http://localhost/api/settings/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  token = ((await login.json()) as { token: string }).token;
});

afterAll(() => {
  mock.module(SLOTS_MOD, () => slotsReal);
  restoreEnv();
});

const _plugin = (path: string, headers: Record<string, string> = {}): Promise<Response> | Response => {
  seenByRoute = [];
  return app.request(`http://localhost/api/plugin/${PLUGIN_FOLDER}${path}`, { headers });
};

const _slots = async (headers: Record<string, string> = {}): Promise<SlotPluginContext | undefined> => {
  seenBySlot = [];
  await app.request("http://localhost/api/slots", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ query: "hello" }),
  });
  return seenBySlot[0];
};

describe("plugin routes marked auth", () => {
  test("refuse anonymous visitors before the handler runs", async () => {
    const res = await _plugin("/secret");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "You shall not pass!" });
    expect(seenByRoute).toEqual([]);
  });

  test("refuse a valid session sent cross-site", async () => {
    const res = await _plugin("/secret", { "x-settings-token": token, "sec-fetch-site": "cross-site" });
    expect(res.status).toBe(401);
    expect(seenByRoute).toEqual([]);
  });

  test("let a signed-in session through", async () => {
    const res = await _plugin("/secret", { cookie: `settings-token=${token}` });
    expect(res.status).toBe(200);
    expect(seenByRoute).toEqual([{ authenticated: true }]);
  });
});

describe("open plugin routes", () => {
  test("tell the handler who passed the gate", async () => {
    expect((await _plugin("/open")).status).toBe(200);
    expect(seenByRoute).toEqual([{ authenticated: false }]);
    await _plugin("/open", { "x-settings-token": token });
    expect(seenByRoute).toEqual([{ authenticated: true }]);
  });

  test("do not trust a token that was never issued", async () => {
    await _plugin("/open", { "x-settings-token": "forged" });
    expect(seenByRoute).toEqual([{ authenticated: false }]);
  });
});

describe("slot plugins", () => {
  test("see ctx.authenticated from the request that ran them", async () => {
    expect((await _slots())?.authenticated).toBe(false);
    expect((await _slots({ cookie: `settings-token=${token}` }))?.authenticated).toBe(true);
  });
});

describe("pages", () => {
  const _authGlobal = async (path: string, headers: Record<string, string> = {}): Promise<string | undefined> => {
    const html = await (await app.request(`http://localhost${path}`, { headers })).text();
    return html.match(/window\.__DEGOOG_AUTH__=(\{[^<]*\})/)?.[1];
  };

  test.each([["/"], ["/search?q=hello"]])("%s tells plugin scripts who passed the gate", async (path) => {
    expect(await _authGlobal(path)).toBe('{"authenticated":false}');
    expect(await _authGlobal(path, { cookie: `settings-token=${token}` })).toBe('{"authenticated":true}');
  });

  test.each([["/"], ["/search?q=hello"]])("%s does not trust a session sent cross-site", async (path) => {
    const headers = { cookie: `settings-token=${token}`, "sec-fetch-site": "cross-site" };
    expect(await _authGlobal(path, headers)).toBe('{"authenticated":false}');
  });
});
