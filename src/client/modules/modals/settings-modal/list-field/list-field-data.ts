import type { SettingField } from "../../../../../shared/setting-field";

export type ListRow = Record<string, string>;

export const isListToggle = (sub: SettingField): boolean =>
  sub.type === "toggle";

export const isListDisplay = (sub: SettingField): boolean =>
  sub.type === "info";

const _isFillable = (sub: SettingField): boolean =>
  !isListToggle(sub) && !isListDisplay(sub);

export const defaultListRow = (itemSchema: SettingField[]): ListRow => {
  const row: ListRow = {};
  for (const sub of itemSchema) {
    row[sub.key] = sub.default != null ? String(sub.default) : "";
  }
  return row;
};

export const parseListValue = (
  raw: string | string[] | undefined,
  itemSchema: SettingField[],
): ListRow[] => {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const rows: ListRow[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const source = item as Record<string, unknown>;
    const row: ListRow = {};
    for (const sub of itemSchema) {
      const v = source[sub.key];
      if (isListToggle(sub)) {
        row[sub.key] = v === true || v === "true" ? "true" : "false";
      } else {
        row[sub.key] = v == null ? "" : String(v);
      }
    }
    rows.push(row);
  }
  return rows;
};

const _rowHasContent = (row: ListRow, itemSchema: SettingField[]): boolean => {
  const fillable = itemSchema.filter(_isFillable);
  if (fillable.length === 0) return true;
  return fillable.some((sub) => (row[sub.key] ?? "").trim() !== "");
};

export const serializeRows = (
  rows: ListRow[],
  itemSchema: SettingField[],
): string => {
  return JSON.stringify(rows.filter((row) => _rowHasContent(row, itemSchema)));
};

export const rowSummary = (row: ListRow, itemSchema: SettingField[]): string => {
  const parts = itemSchema
    .filter((sub) => !isListToggle(sub) && !isListDisplay(sub))
    .map((sub) => (row[sub.key] ?? "").trim())
    .filter(Boolean)
    .slice(0, 2);
  return parts.length ? parts.join(" · ") : "…";
};
