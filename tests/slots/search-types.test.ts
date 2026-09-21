import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SEARCH_TYPE,
  parseTypeList,
  slotRunsOn,
} from "../../src/shared/search-types";
import { baseSlotTypes } from "../../src/server/utils/slot-types";
import { SlotPanelPosition, type SlotPlugin } from "../../src/server/types";

const makeSlot = (searchTypes?: string[]): SlotPlugin => ({
  name: "test",
  description: "test",
  position: SlotPanelPosition.KnowledgePanel,
  searchTypes,
  trigger: () => true,
  execute: async () => ({ html: "<p>hi</p>" }),
});

describe("parseTypeList", () => {
  test("normalises comma strings and arrays, dropping blanks and duplicates", () => {
    expect(parseTypeList("web, news ,videos")).toEqual(["web", "news", "videos"]);
    expect(parseTypeList(["web", "", "news", "web"])).toEqual(["web", "news"]);
    expect(parseTypeList(undefined)).toEqual([]);
    expect(parseTypeList(true)).toEqual([]);
  });

  test("drops image types, prefixed or not, and keeps other prefixed values as-is", () => {
    expect(parseTypeList(["web", "images"])).toEqual(["web"]);
    expect(parseTypeList("images")).toEqual([]);
    expect(parseTypeList(["tab:engine:images", "engine:images"])).toEqual([]);
    expect(parseTypeList(["tab:engine:news", "engine:videos"])).toEqual([
      "tab:engine:news",
      "engine:videos",
    ]);
  });
});

describe("slotRunsOn", () => {
  test("matches plain types and resolves engine tab prefixes on both sides", () => {
    expect(slotRunsOn(["web", "news"], "news")).toBe(true);
    expect(slotRunsOn(["web"], "news")).toBe(false);
    expect(slotRunsOn(["news"], "tab:engine:news")).toBe(true);
    expect(slotRunsOn(["news"], "engine:news")).toBe(true);
    expect(slotRunsOn(["tab:engine:news"], "news")).toBe(true);
    expect(slotRunsOn(["engine:news"], "tab:engine:news")).toBe(true);
    expect(slotRunsOn(["tab:engine:videos"], "news")).toBe(false);
  });

  test("never runs on images even when listed", () => {
    expect(slotRunsOn(["images"], "images")).toBe(false);
    expect(slotRunsOn(["web", "images"], "tab:engine:images")).toBe(false);
  });
});

describe("baseSlotTypes", () => {
  test("honours declared types and defaults to web otherwise", () => {
    expect(baseSlotTypes(makeSlot(["news", "videos"]))).toEqual(["news", "videos"]);
    expect(baseSlotTypes(makeSlot())).toEqual([DEFAULT_SEARCH_TYPE]);
    expect(baseSlotTypes(makeSlot([]))).toEqual([DEFAULT_SEARCH_TYPE]);
    expect(baseSlotTypes(makeSlot(["images"]))).toEqual([DEFAULT_SEARCH_TYPE]);
  });
});
