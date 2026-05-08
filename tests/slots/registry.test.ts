import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  getSlotPluginById,
  getSlotPlugins,
  initSlotPlugins,
} from "../../src/server/extensions/slots/registry";
import { SlotPanelPosition } from "../../src/server/types";

describe("slots registry", () => {
  const origFetch = globalThis.fetch;

  beforeAll(async () => {
    globalThis.fetch = async () => new Response("", { status: 404 });

    const orig = process.env.DEGOOG_PLUGINS_DIR;
    process.env.DEGOOG_PLUGINS_DIR = "/nonexistent-slots-dir";
    await initSlotPlugins();
    if (orig !== undefined) process.env.DEGOOG_PLUGINS_DIR = orig;
    else delete process.env.DEGOOG_PLUGINS_DIR;
  });

  afterAll(() => {
    globalThis.fetch = origFetch;
  });

  test("getSlotPlugins returns array", () => {
    const plugins = getSlotPlugins();
    expect(Array.isArray(plugins)).toBe(true);
  });

  test("getSlotPluginById returns null for unknown id", () => {
    expect(getSlotPluginById("unknown-slot")).toBeNull();
  });

  test("built-in ai-summary slot has position at-a-glance and settingsId", () => {
    const slot = getSlotPluginById("builtin-ai-summary-slot");
    expect(slot).not.toBeNull();
    expect(slot!.position).toBe(SlotPanelPosition.AtAGlance);
    expect(slot!.settingsId).toBe("ai-summary");
  });

  test("built-in at-a-glance slot has position at-a-glance and waitForResults", () => {
    const slot = getSlotPluginById("builtin-at-a-glance-slot");
    expect(slot).not.toBeNull();
    expect(slot!.position).toBe(SlotPanelPosition.AtAGlance);
    expect(slot!.waitForResults).toBe(true);
  });

  test("built-in wikipedia slot has position knowledge-panel", () => {
    const slot = getSlotPluginById("builtin-wikipedia-slot");
    expect(slot).not.toBeNull();
    expect(slot!.position).toBe(SlotPanelPosition.KnowledgePanel);
  });

  test("built-in wikipedia slot trigger returns false for very short queries", async () => {
    const slot = getSlotPluginById("builtin-wikipedia-slot");
    expect(slot).not.toBeNull();
    const result = await slot!.trigger("x");
    expect(result).toBe(false);
  });

  test("built-in wikipedia slot execute returns empty html when no page cached", async () => {
    const slot = getSlotPluginById("builtin-wikipedia-slot");
    expect(slot).not.toBeNull();
    const result = await slot!.execute("__nonexistent_query_xyz__");
    expect(result.html).toBe("");
  });
});
