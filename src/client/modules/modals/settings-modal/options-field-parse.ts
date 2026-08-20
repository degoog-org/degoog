import type { FieldOption, FieldOptionsResult } from "../../../types";

const _isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const _asFieldOption = (entry: unknown): FieldOption | null => {
  if (!_isRecord(entry) || typeof entry.value !== "string") return null;
  if (entry.label !== undefined && typeof entry.label !== "string") return null;
  return entry.label !== undefined
    ? { value: entry.value, label: entry.label }
    : { value: entry.value };
};

export const parseFieldOptionsResponse = (
  raw: unknown,
): FieldOptionsResult | null => {
  if (!_isRecord(raw) || !Array.isArray(raw.options)) return null;
  const options: FieldOption[] = [];
  for (const entry of raw.options) {
    const option = _asFieldOption(entry);
    if (option) options.push(option);
  }
  const parsed: FieldOptionsResult = { options };
  if (typeof raw.notice === "string") parsed.notice = raw.notice;
  if (typeof raw.value === "string") parsed.value = raw.value;
  return parsed;
};
