import { describe, test, expect, beforeAll } from "bun:test";
import {
  initSlotPlugins,
  getSlotPlugins,
  getSlotPluginById,
} from "../../src/slots/registry";

describe("slots registry", () => {
  beforeAll(async () => {
    const orig = process.env.DEGOOG_PLUGINS_DIR;
    process.env.DEGOOG_PLUGINS_DIR = "/nonexistent-slots-dir";
    await initSlotPlugins();
    if (orig !== undefined) process.env.DEGOOG_PLUGINS_DIR = orig;
    else delete process.env.DEGOOG_PLUGINS_DIR;
  });

  test("getSlotPlugins returns array", () => {
    const plugins = getSlotPlugins();
    expect(Array.isArray(plugins)).toBe(true);
  });

  test("getSlotPluginById returns null for unknown id", () => {
    expect(getSlotPluginById("unknown-slot")).toBeNull();
  });

  test("built-in ai-summary slot has position at-a-glance and settingsId", () => {
    const slot = getSlotPluginById("ai-summary");
    expect(slot).not.toBeNull();
    expect(slot!.position).toBe("at-a-glance");
    expect(slot!.settingsId).toBe("ai-summary");
  });
});
