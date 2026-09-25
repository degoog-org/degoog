import { describe, test, expect } from "bun:test";
import {
  parseListValue,
  serializeRows,
  defaultListRow,
  rowSummary,
} from "../../src/client/modules/modals/settings-modal/list-field/list-field-data";
import type { SettingField } from "../../src/shared/setting-field";

const itemSchema: SettingField[] = [
  { key: "name", label: "Name", type: "text" },
  { key: "shortcut", label: "Shortcut", type: "text" },
  { key: "openBase", label: "Open base", type: "toggle", default: "true" },
];

describe("public/list-field-data", () => {
  test("parseListValue parses a JSON array of objects", () => {
    const raw = JSON.stringify([
      { name: "GitHub", shortcut: "gh", openBase: true },
      { name: "YouTube", shortcut: "yt", extra: "ignored" },
    ]);
    const rows = parseListValue(raw, itemSchema);
    expect(rows).toEqual([
      { name: "GitHub", shortcut: "gh", openBase: "true" },
      { name: "YouTube", shortcut: "yt", openBase: "false" },
    ]);
  });

  test("parseListValue returns [] for empty, malformed, or non-array input", () => {
    expect(parseListValue(undefined, itemSchema)).toEqual([]);
    expect(parseListValue("", itemSchema)).toEqual([]);
    expect(parseListValue("not json", itemSchema)).toEqual([]);
    expect(parseListValue('{"a":1}', itemSchema)).toEqual([]);
  });

  test("serializeRows drops rows with no text content and round-trips", () => {
    const rows = [
      { name: "GitHub", shortcut: "gh", openBase: "true" },
      { name: "", shortcut: "", openBase: "true" },
    ];
    const serialized = serializeRows(rows, itemSchema);
    expect(parseListValue(serialized, itemSchema)).toEqual([
      { name: "GitHub", shortcut: "gh", openBase: "true" },
    ]);
  });

  test("serializeRows keeps rows when no text field is fillable", () => {
    const toggleSchema: SettingField[] = [
      { key: "enabled", label: "Enabled", type: "toggle", default: "true" },
    ];
    expect(
      parseListValue(
        serializeRows([{ enabled: "true" }, { enabled: "false" }], toggleSchema),
        toggleSchema,
      ),
    ).toEqual([{ enabled: "true" }, { enabled: "false" }]);

    const mixedSchema: SettingField[] = [
      { key: "name", label: "Name", type: "text" },
      { key: "mode", label: "Mode", type: "select", options: ["a", "b"] },
    ];
    const rows = [
      { name: "GitHub", mode: "a" },
      { name: "", mode: "b" },
    ];
    expect(
      parseListValue(serializeRows(rows, mixedSchema), mixedSchema),
    ).toEqual([
      { name: "GitHub", mode: "a" },
      { name: "", mode: "b" },
    ]);
  });

  test("serializeRows preserves row order as the item position", () => {
    const rows = [
      { name: "First", shortcut: "1", openBase: "true" },
      { name: "Second", shortcut: "2", openBase: "true" },
      { name: "Third", shortcut: "3", openBase: "true" },
    ];
    const reordered = [rows[2], rows[0], rows[1]];
    const parsed = parseListValue(serializeRows(reordered, itemSchema), itemSchema);
    expect(parsed.map((r) => r.name)).toEqual(["Third", "First", "Second"]);
  });

  test("defaultListRow applies schema defaults", () => {
    expect(defaultListRow(itemSchema)).toEqual({
      name: "",
      shortcut: "",
      openBase: "true",
    });
  });

  test("rowSummary joins the first two values, ignoring toggle and info fields", () => {
    expect(
      rowSummary(
        { name: "GitHub", shortcut: "gh", openBase: "true" },
        itemSchema,
      ),
    ).toBe("GitHub · gh");
    expect(
      rowSummary({ name: "", shortcut: "", openBase: "false" }, itemSchema),
    ).toBe("…");
    expect(
      rowSummary({ note: "static", name: "GitHub", on: "true" }, [
        { key: "note", label: "Note", type: "info", default: "static" },
        { key: "name", label: "Name", type: "text" },
        { key: "on", label: "On", type: "toggle" },
      ]),
    ).toBe("GitHub");
  });
});
