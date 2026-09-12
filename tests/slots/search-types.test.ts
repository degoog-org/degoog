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
  test("splits a comma string and trims entries", () => {
    expect(parseTypeList("web, news ,videos")).toEqual([
      "web",
      "news",
      "videos",
    ]);
  });

  test("accepts an array and drops blanks and duplicates", () => {
    expect(parseTypeList(["web", "", "news", "web"])).toEqual(["web", "news"]);
  });

  test("drops images because slots cannot render in media mode", () => {
    expect(parseTypeList(["web", "images"])).toEqual(["web"]);
    expect(parseTypeList("images")).toEqual([]);
  });

  test("returns empty for unset or boolean values", () => {
    expect(parseTypeList(undefined)).toEqual([]);
    expect(parseTypeList(true)).toEqual([]);
  });
});

describe("slotRunsOn", () => {
  test("matches a plain type", () => {
    expect(slotRunsOn(["web", "news"], "news")).toBe(true);
    expect(slotRunsOn(["web"], "news")).toBe(false);
  });

  test("resolves engine tab prefixes to the underlying type", () => {
    expect(slotRunsOn(["news"], "tab:engine:news")).toBe(true);
    expect(slotRunsOn(["news"], "engine:news")).toBe(true);
  });

  test("never runs on images even when listed", () => {
    expect(slotRunsOn(["images"], "images")).toBe(false);
    expect(slotRunsOn(["web", "images"], "tab:engine:images")).toBe(false);
  });
});

describe("baseSlotTypes", () => {
  test("defaults to web when the slot declares nothing", () => {
    expect(baseSlotTypes(makeSlot())).toEqual([DEFAULT_SEARCH_TYPE]);
    expect(baseSlotTypes(makeSlot([]))).toEqual([DEFAULT_SEARCH_TYPE]);
  });

  test("honours declared types", () => {
    expect(baseSlotTypes(makeSlot(["news", "videos"]))).toEqual([
      "news",
      "videos",
    ]);
  });

  test("falls back to web when a slot only declares images", () => {
    expect(baseSlotTypes(makeSlot(["images"]))).toEqual([DEFAULT_SEARCH_TYPE]);
  });
});
