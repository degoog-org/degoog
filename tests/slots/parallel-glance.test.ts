import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { SLOT_POSITION_SETTING_KEY, type SlotPlugin } from "../../src/server/types/extension";
import { type ScoredResult, type SlotPanel, SlotPanelPosition } from "../../src/shared/search-types";

const SETTINGS_MOD = "../../src/server/utils/settings/plugin-settings";
const SLOTS_MOD = "../../src/server/extensions/slots/registry";
const GLANCE_PATH = "http://localhost/api/slots/glance";

const settingsReal = { ...(await import(SETTINGS_MOD)) };
const slotsReal = { ...(await import(SLOTS_MOD)) };

let slots: SlotPlugin[] = [];
let settingsById: Record<string, Record<string, string>> = {};
let router: typeof import("../../src/server/routes/search/slots").default;

const _gate = () => {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
};

const _makeSlot = (
  id: string,
  trigger: SlotPlugin["trigger"],
  execute: () => Promise<void> = async () => {},
): SlotPlugin => ({
  id,
  settingsId: id,
  name: id,
  description: id,
  position: SlotPanelPosition.AtAGlance,
  trigger,
  execute: async () => {
    await execute();
    return { html: id };
  },
});

const _post = async (results?: ScoredResult[]): Promise<{ panels: SlotPanel[]; pending: boolean }> => {
  const res = await router.request(new Request(GLANCE_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "hello", results }),
  }));
  expect(res.status).toBe(200);
  return res.json();
};

beforeAll(async () => {
  mock.module(SETTINGS_MOD, () => ({
    ...settingsReal,
    getSettings: async (id: string) => settingsById[id] ?? {},
    isDisabled: async () => false,
  }));
  mock.module(SLOTS_MOD, () => ({
    ...slotsReal,
    getSlotPlugins: () => slots,
  }));
  router = (await import("../../src/server/routes/search/slots")).default;
});

afterAll(() => {
  mock.module(SETTINGS_MOD, () => settingsReal);
  mock.module(SLOTS_MOD, () => slotsReal);
});

describe("glance route runs plugins side by side", () => {
  test("a slow trigger does not hold back later plugins and panels keep plugin order", async () => {
    const secondExecuted = _gate();
    const executed: string[] = [];
    slots = [
      _makeSlot("first", async () => {
        await secondExecuted.opened;
        return true;
      }, async () => { executed.push("first"); }),
      _makeSlot("second", () => true, async () => {
        executed.push("second");
        secondExecuted.open();
      }),
    ];
    const { panels, pending } = await _post();
    expect(executed).toEqual(["second", "first"]);
    expect(panels.map((panel) => panel.id)).toEqual(["first", "second"]);
    expect(pending).toBe(false);
  });

  test("a slow execute does not hold back later plugins and panels keep plugin order", async () => {
    const secondExecuted = _gate();
    slots = [
      _makeSlot("first", () => true, () => secondExecuted.opened),
      _makeSlot("second", () => true, async () => secondExecuted.open()),
    ];
    const { panels } = await _post();
    expect(panels.map((panel) => panel.id)).toEqual(["first", "second"]);
  });

  test("triggered waiters report pending without executing until results arrive", async () => {
    const execute = mock(async () => {});
    slots = [
      { ..._makeSlot("waiting", () => true, execute), waitForResults: true },
      _makeSlot("immediate", () => true),
      { ..._makeSlot("quiet", () => false), waitForResults: true },
    ];
    const initial = await _post();
    expect(initial.panels.map((panel) => panel.id)).toEqual(["immediate"]);
    expect(initial.pending).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    const completed = await _post([]);
    expect(completed.panels.map((panel) => panel.id)).toEqual(["waiting", "immediate"]);
    expect(completed.pending).toBe(false);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test("untriggered waiters do not report pending", async () => {
    slots = [{ ..._makeSlot("quiet", () => false), waitForResults: true }];
    expect(await _post()).toEqual({ panels: [], pending: false });
  });

  test("a failed plugin does not drop successful panels", async () => {
    slots = [
      _makeSlot("broken", () => true, async () => { throw new Error("failed"); }),
      _makeSlot("working", () => true),
    ];
    const { panels } = await _post();
    expect(panels.map((panel) => panel.id)).toEqual(["working"]);
  });

  test("a plugin moved to the glance box comes back as a glance panel", async () => {
    settingsById = { moved: { [SLOT_POSITION_SETTING_KEY]: SlotPanelPosition.AtAGlance } };
    slots = [{
      ..._makeSlot("moved", () => true),
      position: SlotPanelPosition.KnowledgePanel,
      slotPositions: [SlotPanelPosition.KnowledgePanel, SlotPanelPosition.AtAGlance],
    }];
    const { panels } = await _post();
    settingsById = {};
    expect(panels.map((panel) => [panel.id, panel.position])).toEqual([["moved", SlotPanelPosition.AtAGlance]]);
  });
});
