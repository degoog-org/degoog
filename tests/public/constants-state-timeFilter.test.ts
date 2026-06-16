import { describe, test, expect } from "bun:test";
import {
  DB_NAME,
  PER_PAGE,
  MAX_PAGE,
} from "../../src/client/constants";
import { state } from "../../src/client/state";

describe("public/constants", () => {
  test("DB_NAME is string", () => {
    expect(DB_NAME).toBe("degoog");
  });

  test("PER_PAGE and MAX_PAGE are numbers", () => {
    expect(PER_PAGE).toBe(10);
    expect(MAX_PAGE).toBe(10);
  });
});

describe("public/state", () => {
  test("state has expected keys", () => {
    expect(state).toHaveProperty("currentQuery");
    expect(state).toHaveProperty("currentType", "web");
    expect(state).toHaveProperty("currentPage", 1);
    expect(state).toHaveProperty("currentTimeFilter", "any");
    expect(state).toHaveProperty("inlineGifPlayback", true);
  });

  test("state.currentRelatedSearches is initialized as empty array", () => {
    expect(state).toHaveProperty("currentRelatedSearches");
    expect(Array.isArray(state.currentRelatedSearches)).toBe(true);
    expect(state.currentRelatedSearches).toEqual([]);
  });

  test("state.currentRelatedSearches can be mutated to hold strings", () => {
    const original = state.currentRelatedSearches;
    state.currentRelatedSearches = ["rust programming", "rust tutorial"];
    expect(state.currentRelatedSearches).toEqual(["rust programming", "rust tutorial"]);
    // restore
    state.currentRelatedSearches = original;
  });
});
