import { describe, test, expect } from "bun:test";
import {
  parseListValue,
  serializeRows,
  defaultListRow,
  rowSummary,
} from "../../src/client/modules/modals/settings-modal/list-field-data";
import type { SettingField } from "../../src/client/types";

const itemSchema: SettingField[] = [
  { key: "name", label: "Name", type: "text" },
  { key: "shortcut", label: "Shortcut", type: "text" },
  { key: "openBase", label: "Open base", type: "toggle", default: "true" },
];

describe("public/list-field-data", () => {
  test("parseListValue parses a JSON array of objects", () => {
    const raw = JSON.stringify([
      { name: "GitHub", shortcut: "gh", openBase: true },
      { name: "YouTube", shortcut: "yt" },
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

  test("parseListValue tolerates extra and missing keys", () => {
    const raw = JSON.stringify([{ shortcut: "w", extra: "ignored" }]);
    const rows = parseListValue(raw, itemSchema);
    expect(rows).toEqual([{ name: "", shortcut: "w", openBase: "false" }]);
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

  test("serializeRows keeps rows when schema has no fillable text fields", () => {
    const toggleSchema: SettingField[] = [
      { key: "enabled", label: "Enabled", type: "toggle", default: "true" },
    ];
    const rows = [{ enabled: "true" }, { enabled: "false" }];
    expect(parseListValue(serializeRows(rows, toggleSchema), toggleSchema)).toEqual([
      { enabled: "true" },
      { enabled: "false" },
    ]);

    const selectSchema: SettingField[] = [
      { key: "mode", label: "Mode", type: "select", options: ["a", "b"] },
    ];
    const selectRows = [{ mode: "a" }, { mode: "b" }];
    expect(
      parseListValue(serializeRows(selectRows, selectSchema), selectSchema),
    ).toEqual([{ mode: "a" }, { mode: "b" }]);
  });

  test("serializeRows keeps rows with empty text but populated select", () => {
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

  test("parseListValue supports hex, range and file sub-fields", () => {
    const schema: SettingField[] = [
      { key: "color", label: "Color", type: "hex" },
      { key: "weight", label: "Weight", type: "range", min: "0", max: "10" },
      { key: "icon", label: "Icon", type: "file" },
    ];
    const raw = JSON.stringify([
      { color: "#ff0000", weight: "7", icon: "/plugins/x/uploads/a.png" },
    ]);
    expect(parseListValue(raw, schema)).toEqual([
      { color: "#ff0000", weight: "7", icon: "/plugins/x/uploads/a.png" },
    ]);
  });

  test("rowSummary ignores toggle and info fields", () => {
    const schema: SettingField[] = [
      { key: "note", label: "Note", type: "info", default: "static" },
      { key: "name", label: "Name", type: "text" },
      { key: "on", label: "On", type: "toggle" },
    ];
    expect(
      rowSummary({ note: "static", name: "GitHub", on: "true" }, schema),
    ).toBe("GitHub");
  });

  test("defaultListRow applies schema defaults", () => {
    expect(defaultListRow(itemSchema)).toEqual({
      name: "",
      shortcut: "",
      openBase: "true",
    });
  });

  test("rowSummary joins the first two non-toggle values", () => {
    expect(
      rowSummary(
        { name: "GitHub", shortcut: "gh", openBase: "true" },
        itemSchema,
      ),
    ).toBe("GitHub · gh");
    expect(
      rowSummary({ name: "", shortcut: "", openBase: "false" }, itemSchema),
    ).toBe("…");
  });
});
