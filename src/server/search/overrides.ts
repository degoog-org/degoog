import { runIntercepts } from "../utils/extension-support/run-interceptors";
import type { SearchType, TimeFilter } from "../types/search";
import type { InterceptorOverrides } from "../types/extension";

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
  const { query, overrides } = origQuery.trim()
    ? await runIntercepts(origQuery, lang)
    : { query: origQuery, overrides: {} as InterceptorOverrides };
  return {
    query,
    type: (overrides.searchType ?? searchType) as SearchType,
    lang: overrides.lang ?? lang,
    timeFilter: (overrides.timeFilter ?? timeFilter) as TimeFilter,
  };
};
