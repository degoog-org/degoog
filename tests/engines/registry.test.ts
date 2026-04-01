import { describe, test, expect, beforeAll } from "bun:test";
import {
  initEngines,
  getEngineMap,
  getEngineRegistry,
  getEnginesForSearchType,
  getDefaultEngineConfig,
  getOutgoingAllowlist,
} from "../../src/server/extensions/engines/registry";

describe("engines registry", () => {
  beforeAll(async () => {
    const orig = process.env.DEGOOG_ENGINES_DIR;
    process.env.DEGOOG_ENGINES_DIR = "/nonexistent-dir-for-tests";
    await initEngines();
    if (orig !== undefined) process.env.DEGOOG_ENGINES_DIR = orig;
    else delete process.env.DEGOOG_ENGINES_DIR;
  });

  test("getEngineMap returns builtin engines", () => {
    const map = getEngineMap();
    expect(map["duckduckgo"]).toBeDefined();
    expect(map["google"]).toBeDefined();
    expect(map["duckduckgo"].name).toBe("DuckDuckGo");
  });

  test("getEngineRegistry returns list with id and displayName", () => {
    const reg = getEngineRegistry();
    expect(Array.isArray(reg)).toBe(true);
    const ddg = reg.find((e) => e.id === "duckduckgo");
    expect(ddg).toBeDefined();
    expect(ddg!.displayName).toBe("DuckDuckGo");
  });

  test("getEnginesForSearchType returns web engines for type web", () => {
    const config: Record<string, boolean> = { duckduckgo: true, google: false };
    const engines = getEnginesForSearchType("web", config);
    expect(engines.length).toBeGreaterThan(0);
    expect(engines.some((e) => e.instance.name === "DuckDuckGo")).toBe(true);
  });

  test("getEnginesForSearchType returns array for images type", () => {
    const engines = getEnginesForSearchType("images", {});
    expect(Array.isArray(engines)).toBe(true);
  });

  test("getDefaultEngineConfig returns object keyed by engine id", () => {
    const config = getDefaultEngineConfig();
    expect(typeof config).toBe("object");
    expect("duckduckgo" in config || "google" in config).toBe(true);
  });

  test("getOutgoingAllowlist returns non-empty array", () => {
    const list = getOutgoingAllowlist();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
  });
});
