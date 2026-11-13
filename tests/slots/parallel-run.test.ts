import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SlotPlugin } from "../../src/server/types/extension";
import { SlotPanelPosition } from "../../src/shared/search-types";

const SETTINGS_MOD = "../../src/server/utils/settings/plugin-settings";
const SLOTS_MOD = "../../src/server/extensions/slots/registry";

const settingsReal = { ...(await import(SETTINGS_MOD)) };
const slotsReal = { ...(await import(SLOTS_MOD)) };

let slots: SlotPlugin[] = [];

const _gate = () => {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
};

const makeSlot = (
  id: string,
  trigger: SlotPlugin["trigger"],
  execute: () => Promise<void> = async () => {},
): SlotPlugin => ({
  id,
  settingsId: id,
  name: id,
  description: id,
  position: SlotPanelPosition.KnowledgePanel,
  trigger,
  execute: async () => {
    await execute();
    return { html: id };
  },
});

let runSlotPlugins: typeof import("../../src/server/extensions/slots/run").runSlotPlugins;
let settleSlotPlugins: typeof import("../../src/server/extensions/slots/run").settleSlotPlugins;

beforeAll(async () => {
  mock.module(SETTINGS_MOD, () => ({
    ...settingsReal,
    getSettings: async () => ({}),
    isDisabled: async () => false,
  }));
  mock.module(SLOTS_MOD, () => ({
    ...slotsReal,
    getSlotPlugins: () => slots,
  }));
  ({ runSlotPlugins, settleSlotPlugins } = await import("../../src/server/extensions/slots/run"));
});

afterAll(() => {
  mock.module(SETTINGS_MOD, () => settingsReal);
  mock.module(SLOTS_MOD, () => slotsReal);
});

describe("runSlotPlugins runs plugins side by side", () => {
  test("a slow trigger does not hold back the plugins after it", async () => {
    const secondTriggered = _gate();
    slots = [
      makeSlot("first", async () => {
        await secondTriggered.opened;
        return true;
      }),
      makeSlot("second", () => {
        secondTriggered.open();
        return true;
      }),
    ];
    const panels = await runSlotPlugins("hello");
    expect(panels.map((panel) => panel.id)).toEqual(["first", "second"]);
  });

  test("a slow execute does not hold back the plugins after it", async () => {
    const secondExecuted = _gate();
    slots = [
      makeSlot("first", () => true, () => secondExecuted.opened),
      makeSlot("second", () => true, async () => secondExecuted.open()),
    ];
    const panels = await runSlotPlugins("hello");
    expect(panels.map((panel) => panel.id)).toEqual(["first", "second"]);
  });

  test("panels keep plugin order and skip plugins that do not trigger or that fail", async () => {
    slots = [
      makeSlot("first", () => true),
      makeSlot("quiet", () => false),
      makeSlot("broken-trigger", () => {
        throw new Error("trigger failed");
      }),
      makeSlot("broken-execute", () => true, async () => {
        throw new Error("execute failed");
      }),
      makeSlot("fifth", () => true),
    ];
    const panels = await runSlotPlugins("hello");
    expect(panels.map((panel) => panel.id)).toEqual(["first", "fifth"]);
  });

  test("an aborted run stops waiting on a trigger that never settles", async () => {
    slots = [
      makeSlot("hangs", () => new Promise<boolean>(() => {})),
      makeSlot("fast", () => true),
    ];
    const controller = new AbortController();
    const started = performance.now();
    const run = settleSlotPlugins({ query: "hello", signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    const outcomes = await run;
    expect(performance.now() - started).toBeLessThan(1000);
    expect(outcomes.map((outcome) => (outcome && outcome !== "pending" ? outcome.id : outcome))).toEqual([null, "fast"]);
  });

  test("an already aborted run never starts a trigger", async () => {
    let triggered = 0;
    slots = [
      makeSlot("counted", () => {
        triggered += 1;
        return true;
      }),
    ];
    const controller = new AbortController();
    controller.abort();
    const outcomes = await settleSlotPlugins({ query: "hello", signal: controller.signal });
    expect(outcomes).toEqual([null]);
    expect(triggered).toBe(0);
  });
});
