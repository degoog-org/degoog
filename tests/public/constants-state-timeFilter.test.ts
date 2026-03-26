import { describe, test, expect } from "bun:test";
import {
  DB_NAME,
  DB_VERSION,
  STORE_NAME,
  SETTINGS_KEY,
  PER_PAGE,
  MAX_PAGE,
} from "../../src/client/constants";
import { state } from "../../src/client/state";
import { initOptionsDropdown } from "../../src/client/utils/time-filter";

describe("public/constants", () => {
  test("DB_NAME is string", () => {
    expect(DB_NAME).toBe("degoog");
  });

  test("DB_VERSION is number", () => {
    expect(typeof DB_VERSION).toBe("number");
  });

  test("STORE_NAME and SETTINGS_KEY are strings", () => {
    expect(typeof STORE_NAME).toBe("string");
    expect(typeof SETTINGS_KEY).toBe("string");
  });

  test("PER_PAGE and MAX_PAGE are numbers", () => {
    expect(PER_PAGE).toBe(10);
    expect(MAX_PAGE).toBe(10);
  });
});

describe("public/state", () => {
  test("state has expected keys", () => {
    expect(state).toHaveProperty("currentQuery");
    expect(state).toHaveProperty("currentType", "all");
    expect(state).toHaveProperty("currentPage", 1);
    expect(state).toHaveProperty("currentTimeFilter", "any");
  });
});

describe("public/timeFilter", () => {
  test("initOptionsDropdown is function", () => {
    expect(typeof initOptionsDropdown).toBe("function");
  });
});
