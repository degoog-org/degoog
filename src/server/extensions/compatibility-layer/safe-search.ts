import type { EngineContext, TimeFilter } from "../../types/search";
import type { SettingField } from "../../../shared/setting-field";

export const SAFE_SEARCH_KEY = "safeSearch";

export enum SafeSearch {
  Off = "off",
  Moderate = "moderate",
  Strict = "strict",
}

const NSFW_TO_SAFE: Record<string, SafeSearch> = {
  on: SafeSearch.Strict,
  moderate: SafeSearch.Moderate,
  off: SafeSearch.Off,
};

export const TIME_FILTER_RANGE: Partial<Record<TimeFilter, string>> = {
  hour: "day",
  day: "day",
  week: "week",
  month: "month",
  year: "year",
};

export const resolveSafeSearch = (engineSafe: SafeSearch, context?: EngineContext): SafeSearch => {
  const nsfw = context?.imageFilter?.nsfw;
  return (nsfw && NSFW_TO_SAFE[nsfw]) ?? engineSafe;
};

export const safeSearchField = (defaultValue: SafeSearch): SettingField => ({
  key: SAFE_SEARCH_KEY,
  label: "Safe Search",
  type: "select",
  options: Object.values(SafeSearch),
  default: defaultValue,
  description: "Filter explicit content from this engine's results.",
});
