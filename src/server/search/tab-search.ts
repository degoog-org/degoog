import { getSearchResultTabById } from "../extensions/search-result-tabs/registry";
import type { EngineTiming, ScoredResult } from "../../shared/search-types";
import type { SearchParams, SearchType } from "../types/search";
import { applyDomainRules } from "./domain-rules";
import { signResultThumbnails } from "../utils/net/proxy-sign";
import { logger } from "../utils/logger";
import { isDisabled } from "../utils/settings/plugin-settings";
import { handleSearch } from "./handlers";
import type { RunOptions } from "./index";
import { scoreResults } from "./scoring";

const FALLBACK_TAB_PAGES = 10;

export type TabSearchRequest = Omit<SearchParams, "query" | "searchType">;

type TabSearchParams = TabSearchRequest & {
  tabId: string;
  query: string;
  clientIp: string | undefined;
};

type TabSearchResult = {
  results: ScoredResult[];
  totalPages: number;
  page: number;
  engineTimings: EngineTiming[];
  totalTime: number;
};

type TabRun = {
  results: ScoredResult[];
  engineTimings: EngineTiming[];
  totalPages?: number;
};

const _runEngineType = async (
  engineType: string,
  query: string,
  request: TabSearchRequest,
  runOpts: RunOptions,
): Promise<TabRun> => {
  const response = await handleSearch(
    {
      ...request,
      query,
      searchType: engineType as SearchType,
    },
    runOpts,
  );
  return {
    results: response.results,
    engineTimings: response.engineTimings,
    totalPages:
      response.results.length > 0
        ? (response.totalPages ?? FALLBACK_TAB_PAGES)
        : undefined,
  };
};

const _positionScores = (results: ScoredResult[]): ScoredResult[] =>
  results.map((r, i) => ({ ...r, score: Math.max(100 - i, 1) }));

export async function handleTabSearch({
  tabId,
  query,
  clientIp,
  ...request
}: TabSearchParams, runOpts: RunOptions = {}): Promise<TabSearchResult | null> {
  let engineType: string | undefined;
  const tab = getSearchResultTabById(tabId);
  const tabDisabled = tab
    ? await isDisabled(tab.settingsId ?? tab.id ?? tabId)
    : false;

  if (tabId.startsWith("engine:")) {
    engineType = tabId.slice(7);
    if (!engineType) return null;
  } else if (!tab) {
    return null;
  } else if (tab.engineType && !tabDisabled) {
    engineType = tab.engineType;
  }

  const startTime = performance.now();
  const trimmed = query.trim();
  const engineRun: TabRun = engineType
    ? await _runEngineType(engineType, trimmed, request, runOpts)
    : { results: [], engineTimings: [] };
  const engineTimings = [...engineRun.engineTimings];
  let tabResults: ScoredResult[] = [];
  let totalPages = engineRun.totalPages ?? 1;

  if (tab?.executeSearch && !tabDisabled) {
    const tabStart = performance.now();
    try {
      const result = await tab.executeSearch(trimmed, request.page, {
        clientIp,
      });
      const tabElapsed = Math.round(performance.now() - tabStart);
      logger.debug("plugin", `${tab.id} executed in ${tabElapsed}ms`);
      engineTimings.push({
        name: tab.name,
        time: tabElapsed,
        resultCount: result.results.length,
      });
      tabResults = signResultThumbnails(
        await applyDomainRules(scoreResults([{ results: result.results }])),
      );
      if (result.totalPages && result.totalPages > totalPages)
        totalPages = result.totalPages;
    } catch (err) {
      logger.warn("tab-search", `${tab.name} tab failed`, err);
      engineTimings.push({
        name: tab.name,
        time: Math.round(performance.now() - tabStart),
        resultCount: 0,
      });
    }
  }

  return {
    results: _positionScores([...engineRun.results, ...tabResults]),
    totalPages,
    page: request.page,
    engineTimings,
    totalTime: Math.round(performance.now() - startTime),
  };
}
