import type { ServerSettingValue } from "../../../utils/settings/server-settings";
import { LIST_FIELDS } from "../../../utils/settings/settings-write";
import {
  MAX_INLINE_FIELD_CHARS,
  OVERSIZED_FIELDS_KEY,
  type OversizedFieldInfo,
} from "../../../../shared/indexer";

const _countLines = (text: string): number => {
  if (text.length === 0) return 0;
  let lines = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) lines++;
  }
  return lines;
};

export const trimBigFields = (
  settings: Record<string, ServerSettingValue>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...settings };
  const oversized: Record<string, OversizedFieldInfo> = {};
  for (const key of LIST_FIELDS) {
    const value = settings[key];
    if (typeof value === "string" && value.length > MAX_INLINE_FIELD_CHARS) {
      oversized[key] = { chars: value.length, lines: _countLines(value) };
      out[key] = "";
    }
  }
  if (Object.keys(oversized).length > 0) out[OVERSIZED_FIELDS_KEY] = oversized;
  return out;
};
