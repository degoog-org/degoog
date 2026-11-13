import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { SlotPlugin } from "../../src/server/types/extension";
import { type ScoredResult, SlotPanelPosition } from "../../src/shared/search-types";

const SETTINGS_MOD = "../../src/server/utils/settings/plugin-settings";
const SLOTS_MOD = "../../src/server/extensions/slots/registry";
const SERVER_SETTINGS_MOD = "../../src/server/utils/settings/server-settings";

const settingsReal = { ...(await import(SETTINGS_MOD)) };
const slotsReal = { ...(await import(SLOTS_MOD)) };
const serverSettingsReal = { ...(await import(SERVER_SETTINGS_MOD)) };
const { initServerKey } = await import("../../src/server/utils/security/server-key");
const { signResultThumbnails } = await import("../../src/server/utils/net/proxy-sign");

let received: { id: string; urls: string[] }[] = [];
let instanceSettings: Record<string, unknown> = {};

const makeSlot = (id: string, position: SlotPanelPosition): SlotPlugin => ({
  id,
  settingsId: id,
  name: id,
  description: id,
  position,
  waitForResults: true,
  trigger: () => true,
  execute: async (_query, context) => {
    received.push({ id, urls: (context?.results ?? []).map((r) => r.url) });
    return { html: `<p>${id}</p>` };
  },
});

const result = (url: string): ScoredResult => ({
  title: url,
  url,
  snippet: "",
  source: "engine",
  score: 1,
  sources: ["engine"],
});

let router: { request: (req: Request) => Response | Promise<Response> };

beforeAll(async () => {
  await initServerKey();
  mock.module(SETTINGS_MOD, () => ({
    ...settingsReal,
    getSettings: async () => ({}),
    isDisabled: async () => false,
  }));
  mock.module(SLOTS_MOD, () => ({
    ...slotsReal,
    getSlotPlugins: () => [
      makeSlot("panel", SlotPanelPosition.KnowledgePanel),
      makeSlot("glance", SlotPanelPosition.AtAGlance),
    ],
  }));
  mock.module(SERVER_SETTINGS_MOD, () => ({
    ...serverSettingsReal,
    getInstanceSettings: async () => instanceSettings,
  }));
  router = (await import("../../src/server/routes/search/slots")).default;
});

afterAll(() => {
  mock.module(SETTINGS_MOD, () => settingsReal);
  mock.module(SLOTS_MOD, () => slotsReal);
  mock.module(SERVER_SETTINGS_MOD, () => serverSettingsReal);
});

beforeEach(() => {
  received = [];
  instanceSettings = {};
});

const post = async (
  path: string,
  results: ScoredResult[],
  accept: string,
): Promise<Response> => {
  const res = await router.request(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: accept },
      body: JSON.stringify({ query: "hello", results }),
    }),
  );
  await res.clone().text();
  return res;
};

describe.each([
  ["/api/slots", "application/json"],
  ["/api/slots/glance", "application/json"],
  ["/api/slots", "text/event-stream"],
  ["/api/slots/glance", "text/event-stream"],
])("POST %s results as %s", (path, accept) => {
  test("only results the server sealed reach slot plugins", async () => {
    const [sealed] = signResultThumbnails([result("https://real.example/a")]);
    const forged = result("https://attacker.example/drip");
    const swapped = { ...sealed, url: "https://attacker.example/swap" };
    const res = await post(path, [sealed, forged, swapped], accept);
    expect(res.status).toBe(200);
    expect(received).toHaveLength(1);
    expect(received[0].urls).toEqual(["https://real.example/a"]);
  });

  test("enforces the search API key like /api/search", async () => {
    instanceSettings = { apiKeySearchEnabled: true };
    const [sealed] = signResultThumbnails([result("https://real.example/a")]);
    const res = await post(path, [sealed], accept);
    expect(res.status).toBe(401);
    expect(received).toEqual([]);
  });
});
