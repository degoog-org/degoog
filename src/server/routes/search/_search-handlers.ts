import {
  mergeNewResults,
  search,
  searchSingleEngine,
} from "../../search";
import type {
  SearchParams,
} from "../../types";
import * as cache from "../../utils/cache";
import { cacheKey } from "../../utils/search";
import { signResultThumbnails } from "../../utils/proxy-sign";
import { logger } from "../../utils/logger";
import { applyDomainRules } from "./_domain-rules";

export async function handleSearch(params: SearchParams) {
  const {
    query,
    engines,
    searchType,
    page,
    timeFilter,
    lang,
    dateFrom,
    dateTo,
  } = params;
  const key = cacheKey(
    query,
    engines,
    searchType,
    page,
    timeFilter,
    lang,
    dateFrom,
    dateTo,
  );

  const cached = cache.get(key);
  if (cached) {
    const qShort = query.trim().slice(0, 80);
    const enginesOn = Object.values(engines).filter(Boolean).length;
    logger.debug(
      "search",
      `cache hit q="${qShort}" type=${searchType} page=${page} enginesOn=${enginesOn} results=${cached.results.length} timings=${cached.engineTimings.length}`,
    );
    return { ...cached, results: signResultThumbnails(await applyDomainRules(cached.results)) };
  }

  const response = await search(
    query,
    engines,
    searchType,
    page,
    timeFilter,
    lang,
    dateFrom,
    dateTo,
  );

  const ttl = cache.hasFailedEngines(response)
    ? cache.SHORT_TTL_MS
    : searchType === "news"
      ? cache.NEWS_TTL_MS
      : undefined;
  cache.set(key, response, ttl);

  return { ...response, results: signResultThumbnails(await applyDomainRules(response.results)) };
}

export async function handleRetry(params: SearchParams & { engineName: string }) {
  const {
    query,
    engineName,
    engines,
    searchType,
    page,
    timeFilter,
    lang,
    dateFrom,
    dateTo,
  } = params;

  const { results: newResults, timing } = await searchSingleEngine(
    engineName,
    query,
    page,
    timeFilter,
    lang,
    dateFrom,
    dateTo,
  );
  const key = cacheKey(
    query,
    engines,
    searchType,
    page,
    timeFilter,
    lang,
    dateFrom,
    dateTo,
  );
  const cached = cache.get(key);

  if (cached) {
    const updatedTimings = cached.engineTimings.map((et) =>
      et.name === engineName ? timing : et,
    );
    const merged =
      newResults.length > 0
        ? mergeNewResults(cached.results, newResults)
        : cached.results;
    const updated = {
      ...cached,
      results: merged,
      engineTimings: updatedTimings,
    };
    cache.set(
      key,
      updated,
      cache.hasFailedEngines(updated) ? cache.SHORT_TTL_MS : undefined,
    );
    return { ...updated, results: signResultThumbnails(await applyDomainRules(merged)) };
  }

  return {
    results: newResults.map((r, i) => ({
      ...r,
      score: Math.max(10 - i, 1),
      sources: [r.source],
    })),
    timing,
    engineTimings: [timing],
  };
}
