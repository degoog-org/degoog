import { describe, test, expect, beforeAll } from "bun:test";
import { getEngineMap } from "../../src/server/extensions/engines/catalog";
import { initEngines } from "../../src/server/extensions/engines/loader";
import { resolveTabSearchType } from "../../src/server/extensions/engines/search-types";
import { primaryType } from "../../src/shared/search-types";

describe("engines registry", () => {
  beforeAll(async () => {
    const orig = process.env.DEGOOG_ENGINES_DIR;
    process.env.DEGOOG_ENGINES_DIR = "/nonexistent-dir-for-tests";
    await initEngines();
    if (orig !== undefined) process.env.DEGOOG_ENGINES_DIR = orig;
    else delete process.env.DEGOOG_ENGINES_DIR;
  });

  test("no built-in engines remain", () => {
    const map = getEngineMap();
    expect(map["duckduckgo"]).toBeUndefined();
    expect(map["bing"]).toBeUndefined();
    expect(map["brave"]).toBeUndefined();
    expect(map["wikipedia"]).toBeUndefined();
    expect(map["reddit"]).toBeUndefined();
  });

  test("primaryType uses first declared type", () => {
    expect(primaryType(["web", "extracool", "third"])).toBe("web");
    expect(primaryType(["extracool", "third"])).toBe("extracool");
    expect(primaryType(["images"])).toBe("images");
    expect(primaryType([])).toBe("web");
  });

  test("resolveTabSearchType honors preferred tab when listed", () => {
    const types = ["web", "extracool", "third"];
    expect(resolveTabSearchType(types, "third")).toBe("third");
    expect(resolveTabSearchType(types, "web")).toBe("web");
    expect(resolveTabSearchType(types)).toBe("web");
  });

});
