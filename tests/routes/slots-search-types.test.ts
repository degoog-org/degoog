import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { SLOT_SEARCH_TYPES_KEY, type SlotPlugin } from "../../src/server/types/extension";
import { SlotPanelPosition } from "../../src/shared/search-types";
import type { SettingValue } from "../../src/server/utils/settings/plugin-settings";

const SETTINGS_MOD = "../../src/server/utils/settings/plugin-settings";
const SLOTS_MOD = "../../src/server/extensions/slots/registry";

const settingsReal = { ...(await import(SETTINGS_MOD)) };
const slotsReal = { ...(await import(SLOTS_MOD)) };

const STORED: Record<string, Record<string, SettingValue>> = {
  "news-panel": { [SLOT_SEARCH_TYPES_KEY]: ["news"] },
  "muted-panel": { [SLOT_SEARCH_TYPES_KEY]: [] },
  "news-glance": { [SLOT_SEARCH_TYPES_KEY]: ["news"] },
  "muted-glance": { [SLOT_SEARCH_TYPES_KEY]: [] },
};

let executed: string[] = [];

const makeSlot = (id: string, position: SlotPanelPosition): SlotPlugin => ({
  id,
  settingsId: id,
  name: id,
  description: id,
  position,
  trigger: () => true,
  execute: async () => {
    executed.push(id);
    return { html: `<p>${id}</p>` };
  },
});

const SLOTS = [
  makeSlot("web-panel", SlotPanelPosition.KnowledgePanel),
  makeSlot("news-panel", SlotPanelPosition.KnowledgePanel),
  makeSlot("muted-panel", SlotPanelPosition.KnowledgePanel),
  makeSlot("web-glance", SlotPanelPosition.AtAGlance),
  makeSlot("news-glance", SlotPanelPosition.AtAGlance),
  makeSlot("muted-glance", SlotPanelPosition.AtAGlance),
];

let router: { request: (req: Request) => Response | Promise<Response> };

beforeAll(async () => {
  mock.module(SETTINGS_MOD, () => ({
    ...settingsReal,
    getSettings: async (id: string) => STORED[id] ?? {},
    isDisabled: async () => false,
  }));
  mock.module(SLOTS_MOD, () => ({
    ...slotsReal,
    getSlotPlugins: () => SLOTS,
  }));
  router = (await import("../../src/server/routes/search/slots")).default;
});

afterAll(() => {
  mock.module(SETTINGS_MOD, () => settingsReal);
  mock.module(SLOTS_MOD, () => slotsReal);
});

beforeEach(() => {
  executed = [];
});

const post = async (path: string, type?: string): Promise<string[]> => {
  const body = type === undefined ? { query: "hello" } : { query: "hello", type };
  const res = await router.request(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  expect(res.status).toBe(200);
  const data = (await res.json()) as { panels: { id: string }[] };
  return data.panels.map((panel) => panel.id);
};

describe.each([
  ["/api/slots", "panel"],
  ["/api/slots/glance", "glance"],
])("POST %s search types", (path, suffix) => {
  test("omitted type runs only web slots", async () => {
    expect(await post(path)).toEqual([`web-${suffix}`]);
    expect(executed).toEqual([`web-${suffix}`]);
  });

  test("configured non-web type runs only slots enabled for it", async () => {
    expect(await post(path, "news")).toEqual([`news-${suffix}`]);
    expect(executed).toEqual([`news-${suffix}`]);
  });

  test("prefixed engine type resolves to its base type", async () => {
    expect(await post(path, "tab:engine:news")).toEqual([`news-${suffix}`]);
  });

  test("images never runs any slot", async () => {
    expect(await post(path, "images")).toEqual([]);
    expect(executed).toEqual([]);
  });
});
