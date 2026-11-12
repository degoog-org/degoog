import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SlotPlugin } from "../../src/server/types/extension";
import { SlotPanelPosition } from "../../src/shared/search-types";

const SETTINGS_MOD = "../../src/server/utils/settings/plugin-settings";
const SLOTS_MOD = "../../src/server/extensions/slots/registry";

const settingsReal = { ...(await import(SETTINGS_MOD)) };
const slotsReal = { ...(await import(SLOTS_MOD)) };

const makeSlot = (id: string, waitForResults: boolean): SlotPlugin => ({
  id,
  settingsId: id,
  name: id,
  description: id,
  position: SlotPanelPosition.AboveResults,
  supportsNojs: true,
  waitForResults,
  trigger: () => true,
  execute: async () => ({ html: `<p>${id}</p>` }),
});

let renderNojsSlots: typeof import("../../src/server/nojs/slots").renderNojsSlots;

beforeAll(async () => {
  mock.module(SETTINGS_MOD, () => ({
    ...settingsReal,
    getSettings: async () => ({}),
    isDisabled: async () => false,
  }));
  mock.module(SLOTS_MOD, () => ({
    ...slotsReal,
    getSlotPlugins: () => [
      makeSlot("needs-results", true),
      makeSlot("instant", false),
      makeSlot("also-needs-results", true),
    ],
  }));
  renderNojsSlots = (await import("../../src/server/nojs/slots")).renderNojsSlots;
});

afterAll(() => {
  mock.module(SETTINGS_MOD, () => settingsReal);
  mock.module(SLOTS_MOD, () => slotsReal);
});

describe("renderNojsSlots", () => {
  test("instant and after-results panels share one registry order, like the JS page", async () => {
    const { byContainer } = await renderNojsSlots("hello", undefined, [], "en", "web");
    const html = byContainer["slot-above-results"];
    const positions = ["needs-results", "instant", "also-needs-results"].map((id) =>
      html.indexOf(`<p>${id}</p>`),
    );
    expect(positions.every((at) => at >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
