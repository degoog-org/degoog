import { state } from "../../state";
import type { SettingField } from "../../../shared/setting-field";
import { isFieldVisible } from "../../../shared/visible-when";

export const cleanUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname +
      parsed.pathname +
      (state.hideUrlParams ? "" : parsed.search)
    );
  } catch {
    return url;
  }
};

const _hasValue = (v: string | string[] | undefined): boolean => {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim() !== "";
  return Array.isArray(v) && v.length > 0;
};

export const getConfigStatus = (ext: {
  configurable: boolean;
  settingsSchema: SettingField[];
  settings: Record<string, string | string[]>;
}): "configured" | "needs-config" | null => {
  if (!ext.configurable || ext.settingsSchema.length === 0) return null;
  const missingRequired = ext.settingsSchema.some(
    (f) =>
      f.required === true &&
      isFieldVisible(f, ext.settingsSchema, ext.settings) &&
      !_hasValue(ext.settings[f.key]),
  );
  return missingRequired ? "needs-config" : "configured";
};

export const getInputElement = (id: string) => {
  return document.getElementById(id) as HTMLInputElement | null;
};
