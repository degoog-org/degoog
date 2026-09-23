import type { SettingField } from "../../../../shared/setting-field";
import type { SettingValue } from "../../../utils/settings/plugin-settings";

export const FOURGET_OPT_PREFIX = "fourgetOpt_";

export const NSFW_FILTER = "nsfw";

const DATE_MARKERS = ["_DATE", "_SEARCH"];

export interface FourGetFilter {
  display?: string;
  option?: Record<string, string> | string;
}

export type FourGetPageFilters = Record<string, FourGetFilter>;

export type FourGetFilters = Record<string, FourGetPageFilters>;

const _label = (name: string, filter: FourGetFilter): string =>
  filter.display?.trim() || name;

const _isSelect = (filter: FourGetFilter): boolean =>
  typeof filter.option === "object" && filter.option !== null;

export const isDriven = (filter: FourGetFilter): boolean =>
  typeof filter.option === "string" && DATE_MARKERS.includes(filter.option);

export const optionFields = (filters: FourGetFilters): SettingField[] => {
  const seen = new Map<string, SettingField>();
  for (const page of Object.values(filters ?? {})) {
    for (const [name, filter] of Object.entries(page ?? {})) {
      if (name === NSFW_FILTER || !_isSelect(filter)) continue;
      const key = `${FOURGET_OPT_PREFIX}${name}`;
      if (seen.has(key)) continue;
      const options = Object.keys(filter.option as Record<string, string>);
      if (options.length === 0) continue;
      seen.set(key, {
        key,
        label: _label(name, filter),
        type: "select",
        options,
        default: options[0],
      });
    }
  }
  return [...seen.values()];
};

export const overridesFrom = (
  settings: Record<string, SettingValue>,
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings ?? {})) {
    if (!key.startsWith(FOURGET_OPT_PREFIX)) continue;
    if (typeof value !== "string" || value.trim() === "") continue;
    out[key.slice(FOURGET_OPT_PREFIX.length)] = value;
  }
  return out;
};
