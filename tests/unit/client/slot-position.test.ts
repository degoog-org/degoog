import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { SlotPanelPosition } from "../../../src/shared/search-types";
import { setSettings } from "../../../src/server/utils/settings/plugin-settings";
import { slotPosition } from "../../../src/server/extensions/slots/run";
import type { SlotPlugin } from "../../../src/server/types/extension";

const SETTINGS_ID = "at-a-glance-slot";

const withSettingsFile = async <T>(fn: () => Promise<T>): Promise<T> => {
  const dir = mkdtempSync(join(tmpdir(), "degoog-slot-position-"));
  const settingsFile = join(dir, "plugin-settings.json");
  const prev = process.env.DEGOOG_PLUGIN_SETTINGS_FILE;
  process.env.DEGOOG_PLUGIN_SETTINGS_FILE = settingsFile;
  writeFileSync(settingsFile, "{}");
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.DEGOOG_PLUGIN_SETTINGS_FILE;
    else process.env.DEGOOG_PLUGIN_SETTINGS_FILE = prev;
    rmSync(dir, { recursive: true, force: true });
  }
};

const movableSlot = (): SlotPlugin =>
  ({
    id: "at-a-glance",
    settingsId: SETTINGS_ID,
    name: "At a Glance",
    description: "",
    position: SlotPanelPosition.AtAGlance,
    slotPositions: [
      SlotPanelPosition.AtAGlance,
      SlotPanelPosition.AboveSidebar,
      SlotPanelPosition.BelowSidebar,
      SlotPanelPosition.BelowResults,
    ],
    trigger: () => true,
    execute: async () => ({ html: "" }),
  }) as SlotPlugin;

const fixedSlot = (): SlotPlugin =>
  ({
    id: "wikipedia",
    settingsId: "wikipedia-slot",
    name: "Wikipedia",
    description: "",
    position: SlotPanelPosition.KnowledgePanel,
    trigger: () => true,
    execute: async () => ({ html: "" }),
  }) as SlotPlugin;

describe("slotPosition", () => {
  test("falls back to the declared position when nothing is stored", async () => {
    await withSettingsFile(async () => {
      expect(await slotPosition(movableSlot(), SETTINGS_ID)).toBe(
        SlotPanelPosition.AtAGlance,
      );
    });
  });

  test("honours a stored position the slot offers", async () => {
    await withSettingsFile(async () => {
      await setSettings(SETTINGS_ID, {
        slotPosition: SlotPanelPosition.AboveSidebar,
      });
      expect(await slotPosition(movableSlot(), SETTINGS_ID)).toBe(
        SlotPanelPosition.AboveSidebar,
      );
    });
  });

  test("ignores a stored position the slot does not offer", async () => {
    await withSettingsFile(async () => {
      await setSettings(SETTINGS_ID, {
        slotPosition: SlotPanelPosition.KnowledgePanel,
      });
      expect(await slotPosition(movableSlot(), SETTINGS_ID)).toBe(
        SlotPanelPosition.AtAGlance,
      );
    });
  });

  test("ignores a stored position on a slot that cannot move", async () => {
    await withSettingsFile(async () => {
      await setSettings("wikipedia-slot", {
        slotPosition: SlotPanelPosition.AboveSidebar,
      });
      expect(await slotPosition(fixedSlot(), "wikipedia-slot")).toBe(
        SlotPanelPosition.KnowledgePanel,
      );
    });
  });
});

