import { getEnginesForCustomType } from "../extensions/engines/catalog";
import { getSearchResultTabById } from "../extensions/search-result-tabs/registry";
import { createSearchEngineContext } from "./engine-context";
import type { EngineTiming, ScoredResult } from "../../shared/search-types";
import { applyDomainRules } from "./domain-rules";
import { signResultThumbnails } from "../utils/net/proxy-sign";
import { logger } from "../utils/logger";
import { isDisabled } from "../utils/settings/plugin-settings";
import { agreedPageTotal, makePageCounter } from "./page-counter";

const FALLBACK_TAB_PAGES = 10;

type TabSearchParams = {
  tabId: string;
  query: string;
  page: number;
  clientIp: string | undefined;
};

type TabSearchResult = {
  results: ScoredResult[];
  totalPages: number;
  page: number;
  engineTimings: EngineTiming[];
  totalTime: number;
};

export async function handleTabSearch({
  tabId,
  query,
  page,
  clientIp,
}: TabSearchParams): Promise<TabSearchResult | null> {
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
  const engineTimings: EngineTiming[] = [];
  const allResults: ScoredResult[] = [];
  let totalPages = 1;

  if (engineType) {
    const engines = await getEnginesForCustomType(engineType);
    const outcomes = await Promise.all(
      engines.map(async ({ id, instance: e }) => {
        const start = performance.now();
        const pageCounter = makePageCounter();
        const engineContext = createSearchEngineContext(id, {
          pageCounter,
        });
        try {
          const value = await e.executeSearch(
            query.trim(),
            page,
            undefined,
            engineContext,
          );
          return {
            name: e.name,
            time: Math.round(performance.now() - start),
            resultCount: value.length,
            results: value,
            pages: pageCounter.total(),
          };
        } catch (err) {
          logger.warn("tab-search", `${e.name} engine failed`, err);
          return {
            name: e.name,
            time: Math.round(performance.now() - start),
            resultCount: 0,
            results: [] as ScoredResult[],
            pages: undefined,
          };
        }
      }),
    );
    for (const o of outcomes) {
      engineTimings.push({
        name: o.name,
        time: o.time,
        resultCount: o.resultCount,
      });
      let idx = allResults.length;
      for (const r of o.results) {
        allResults.push({
          ...r,
          score: Math.max(100 - idx, 1),
          sources: [r.source],
        });
        idx++;
      }
    }
    if (allResults.length > 0) {
      totalPages =
        agreedPageTotal(outcomes.map((o) => o.pages)) ?? FALLBACK_TAB_PAGES;
    }
  }

  if (tab?.executeSearch && !tabDisabled) {
    const tabStart = performance.now();
    try {
      const result = await tab.executeSearch(query.trim(), page, {
        clientIp,
      });
      const tabElapsed = Math.round(performance.now() - tabStart);
      logger.debug("plugin", `${tab.id} executed in ${tabElapsed}ms`);
      engineTimings.push({
        name: tab.name,
        time: tabElapsed,
        resultCount: result.results.length,
      });
      const offset = allResults.length;
      for (let i = 0; i < result.results.length; i++) {
        const r = result.results[i];
        allResults.push({
          ...r,
          score: Math.max(100 - offset - i, 1),
          sources: [r.source],
        });
      }
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

  const totalTime = Math.round(performance.now() - startTime);
  const finalResults = signResultThumbnails(await applyDomainRules(allResults));

  return {
    results: finalResults,
    totalPages,
    page,
    engineTimings,
    totalTime,
  };
}
