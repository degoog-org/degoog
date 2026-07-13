import { mergeNewResults, search, searchSingleEngine } from "../../search";
import type { SearchParams } from "../../types";
import * as cache from "../../utils/cache";
import { cacheKey } from "../../utils/search";
import { signResultThumbnails } from "../../utils/proxy-sign";
import { logger } from "../../utils/logger";
import { applyDomainRules } from "./_domain-rules";
import { runIntercepts } from "../../utils/run-interceptors";
import { getInstanceSettings } from "../../utils/server-settings";
import { asBoolean } from "../../utils/plugin-settings";
import { DEGOOG_ENGINE_NAME, isRecalled, maybeIndex, tagIndexRelation, toFilterTag } from "../../indexer/store";
import { engineSettingsFingerprint } from "../../search/engine-selection";

export async function handleSearch(params: SearchParams) {
  const {
    query: origQ,
    engines,
    searchType,
    page,
    timeFilter,
    lang,
    dateFrom,
    dateTo,
    imageFilter,
  } = params;

  const { query, overrides } = await runIntercepts(origQ, lang);
  const type = (overrides.searchType ?? searchType) as typeof searchType;
  const resolvedLang = overrides.lang ?? lang;
  const resolvedTime = (overrides.timeFilter ??
    timeFilter) as typeof timeFilter;

  const key = cacheKey(
    query,
    engines,
    type,
    page,
    resolvedTime,
    resolvedLang,
    dateFrom,
    dateTo,
    imageFilter,
    await engineSettingsFingerprint(type, engines),
  );

  const cached = await cache.get(key);
  if (cached) {
    const qShort = query.trim().slice(0, 80);
    const enginesOn = Object.values(engines).filter(Boolean).length;
    logger.debug(
      "search",
      `cache hit q="${qShort}" type=${type} page=${page} enginesOn=${enginesOn} results=${cached.results.length} timings=${cached.engineTimings.length}`,
    );
    return {
      ...cached,
      relatedSearches: [],
      results: signResultThumbnails(
        tagIndexRelation(await applyDomainRules(cached.results)),
      ),
    };
  }

  const { indexBasis, ...response } = await search(
    query,
    engines,
    type,
    page,
    resolvedTime,
    resolvedLang,
    dateFrom,
    dateTo,
    imageFilter,
  );

  const settings = await getInstanceSettings();

  const displayResults = await applyDomainRules(response.results);
  const filtersTag = toFilterTag({
    lang: resolvedLang,
    timeFilter: resolvedTime,
    dateFrom,
    dateTo,
    imageFilter,
  });
  const indexedUrls = await maybeIndex(
    asBoolean(settings.degoogIndexerEnabled),
    query,
    type,
    await applyDomainRules(indexBasis),
    filtersTag,
  );

  const degoogTiming = response.engineTimings.find(
    (et) => et.name === DEGOOG_ENGINE_NAME,
  );
  const justIndexed = indexedUrls.length > 0 && degoogTiming?.resultCount === 0;

  if (!cache.allEnginesFailed(response)) {
    const ttl = justIndexed
      ? cache.JUST_INDEXED_TTL_MS
      : cache.someEnginesFailed(response)
        ? cache.SHORT_TTL_MS
        : undefined;
    await cache.set(key, response, ttl);
  }

  return {
    ...response,
    results: signResultThumbnails(
      tagIndexRelation(displayResults, new Set(indexedUrls)),
    ),
  };
}

export async function handleRetry(
  params: SearchParams & { engineName: string },
) {
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
    imageFilter,
  } = params;

  const { overrides } = await runIntercepts(query, lang);
  const type = (overrides.searchType ?? searchType) as typeof searchType;
  const { results: newResults, timing } = await searchSingleEngine(
    engineName,
    query,
    page,
    timeFilter,
    lang,
    dateFrom,
    dateTo,
    imageFilter,
    undefined,
    type,
  );
  const key = cacheKey(
    query,
    engines,
    type,
    page,
    timeFilter,
    lang,
    dateFrom,
    dateTo,
    imageFilter,
    await engineSettingsFingerprint(type, engines),
  );
  const cached = await cache.get(key);

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
    await cache.set(
      key,
      updated,
      cache.someEnginesFailed(updated) ? cache.SHORT_TTL_MS : undefined,
    );

    const settings = await getInstanceSettings();
    const displayMerged = await applyDomainRules(merged);
    const filtersTag = toFilterTag({
      lang,
      timeFilter,
      dateFrom,
      dateTo,
      imageFilter,
    });
    const indexedUrls = await maybeIndex(
      asBoolean(settings.degoogIndexerEnabled),
      query,
      type,
      displayMerged.filter((r) => !isRecalled(r)),
      filtersTag,
    );

    return {
      ...updated,
      results: signResultThumbnails(
        tagIndexRelation(displayMerged, new Set(indexedUrls)),
      ),
    };
  }

  return {
    results: tagIndexRelation(
      newResults.map((r, i) => ({
        ...r,
        score: Math.max(10 - i, 1),
        sources: [r.source],
      })),
    ),
    timing,
    engineTimings: [timing],
  };
}
