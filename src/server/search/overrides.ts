import { runIntercepts } from "../utils/extension-support/run-interceptors";
import type { SearchType, TimeFilter } from "../types/search";

interface ResolvedSearch {
  query: string;
  type: SearchType;
  lang: string;
  timeFilter: TimeFilter;
}

export const resolveSearchOverrides = async (
  origQuery: string,
  searchType: SearchType,
  lang: string,
  timeFilter: TimeFilter,
): Promise<ResolvedSearch> => {
  const { query, overrides } = await runIntercepts(origQuery, lang);
  return {
    query,
    type: (overrides.searchType ?? searchType) as SearchType,
    lang: overrides.lang ?? lang,
    timeFilter: (overrides.timeFilter ?? timeFilter) as TimeFilter,
  };
};
