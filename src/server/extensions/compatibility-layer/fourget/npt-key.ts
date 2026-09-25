import type { TimeFilter } from "../../../types/search";

export interface NptScope {
  query: string;
  page: number;
  nsfw: string;
  timeFilter: TimeFilter;
  dateFrom?: string;
  dateTo?: string;
  overrides: Record<string, string>;
}

export const nptKey = (scope: NptScope): string => {
  const options = Object.entries(scope.overrides)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
  const window =
    scope.timeFilter === "custom"
      ? `custom:${scope.dateFrom ?? ""}~${scope.dateTo ?? ""}`
      : scope.timeFilter;
  return `${scope.nsfw}|${window}|${options}::${scope.query}::${scope.page}`;
};
