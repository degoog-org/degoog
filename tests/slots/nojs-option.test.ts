import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  SlotPanelPosition,
  type SlotPlugin,
  type SlotPluginContext,
} from "../../src/server/types";

const SETTINGS_MOD = "../../src/server/utils/plugin-settings";
const SLOTS_MOD = "../../src/server/extensions/slots/registry";

const settingsReal = { ...(await import(SETTINGS_MOD)) };
const slotsReal = { ...(await import(SLOTS_MOD)) };

let seen: Array<{ id: string; context: SlotPluginContext }> = [];

const makeSlot = (id: string, supportsNojs?: boolean): SlotPlugin => ({
  id,
  settingsId: id,
  name: id,
  description: id,
  position: SlotPanelPosition.KnowledgePanel,
  ...(supportsNojs === undefined ? {} : { supportsNojs }),
  trigger: () => true,
  execute: async (_query, context) => {
    if (context) seen.push({ id, context });
    return { html: `<p>${id}</p>` };
  },
});

const PLAIN_SLOT = "plain-slot";
const OPTED_IN_SLOT = "opted-in-slot";
const SLOTS = [makeSlot(PLAIN_SLOT), makeSlot(OPTED_IN_SLOT, true)];

let runSlotPlugins: typeof import("../../src/server/utils/search").runSlotPlugins;

beforeAll(async () => {
  mock.module(SETTINGS_MOD, () => ({
    ...settingsReal,
    getSettings: async () => ({}),
    isDisabled: async () => false,
  }));
  mock.module(SLOTS_MOD, () => ({
    ...slotsReal,
    getSlotPlugins: () => SLOTS,
  }));
  runSlotPlugins = (await import("../../src/server/utils/search")).runSlotPlugins;
});

afterAll(() => {
  mock.module(SETTINGS_MOD, () => settingsReal);
  mock.module(SLOTS_MOD, () => slotsReal);
});

beforeEach(() => {
  seen = [];
});

describe("runSlotPlugins without the nojs option is unchanged", () => {
  test("every eligible plugin runs with no nojs key on its context", async () => {
    const panels = await runSlotPlugins("hello");
    expect(panels.map((panel) => panel.id)).toEqual([PLAIN_SLOT, OPTED_IN_SLOT]);
    expect(seen.map((entry) => entry.id)).toEqual([PLAIN_SLOT, OPTED_IN_SLOT]);
    for (const entry of seen) expect("nojs" in entry.context).toBe(false);
  });

  test("an explicit nojs false behaves like the option being absent", async () => {
    const panels = await runSlotPlugins("hello", undefined, undefined, {
      nojs: false,
    });
    expect(panels.map((panel) => panel.id)).toEqual([PLAIN_SLOT, OPTED_IN_SLOT]);
    for (const entry of seen) {
      expect("nojs" in entry.context).toBe(false);
    }
  });

  test("the context keys match the nojs run apart from nojs itself", async () => {
    await runSlotPlugins("hello");
    const plainKeys = Object.keys(
      seen.find((entry) => entry.id === OPTED_IN_SLOT)!.context,
    );
    seen = [];
    await runSlotPlugins("hello", undefined, undefined, { nojs: true });
    const nojsKeys = Object.keys(
      seen.find((entry) => entry.id === OPTED_IN_SLOT)!.context,
    );
    expect(nojsKeys.filter((key) => key !== "nojs")).toEqual(plainKeys);
  });
});

describe("runSlotPlugins with the nojs option is default deny", () => {
  test("only plugins with supportsNojs true run, and they receive nojs true", async () => {
    const panels = await runSlotPlugins("hello", undefined, undefined, {
      nojs: true,
    });
    expect(panels.map((panel) => panel.id)).toEqual([OPTED_IN_SLOT]);
    expect(seen.map((entry) => entry.id)).toEqual([OPTED_IN_SLOT]);
    expect(seen[0].context.nojs).toBe(true);
  });
});
