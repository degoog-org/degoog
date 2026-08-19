import { scoreResults, search, searchSingleEngine } from "../../search";
import type { SearchParams } from "../../types";
import { signResultThumbnails } from "../../utils/proxy-sign";
import { applyDomainRules } from "./_domain-rules";
import { runIntercepts } from "../../utils/run-interceptors";
import { getInstanceSettings } from "../../utils/server-settings";
import { asBoolean } from "../../utils/plugin-settings";
import { isRecalled, maybeIndex, tagIndexRelation, toFilterTag } from "../../indexer/store";
import { selectActiveEngines } from "../../search/engine-selection";
import {
  isCacheable,
  readActiveRuns,
  type RunScope,
} from "../../search/engine-cache";

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
    query: origQ,
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

  const { query, overrides } = await runIntercepts(origQ, lang);
  const type = (overrides.searchType ?? searchType) as typeof searchType;
  const resolvedLang = overrides.lang ?? lang;
  const resolvedTime = (overrides.timeFilter ?? timeFilter) as typeof timeFilter;

  const { results: newResults, timing } = await searchSingleEngine(
    engineName,
    query,
    page,
    resolvedTime,
    resolvedLang,
    dateFrom,
    dateTo,
    imageFilter,
    undefined,
    type,
    { forceFresh: true },
  );

  const scope: RunScope = {
    query,
    type,
    page,
    timeFilter: resolvedTime,
    lang: resolvedLang,
    dateFrom,
    dateTo,
    imageFilter,
  };
  const active = await selectActiveEngines(type, engines, imageFilter);
  const retried = active.find((e) => e.instance.name === timing.name);
  const others = active.filter((e) => e.instance.name !== timing.name);

  const liveRuns = await Promise.all(
    others
      .filter((e) => !isCacheable(e.instance.name))
      .map(async (engine) => ({
        engine,
        run: await searchSingleEngine(
          engine.id,
          query,
          page,
          resolvedTime,
          resolvedLang,
          dateFrom,
          dateTo,
          imageFilter,
          undefined,
          type,
        ),
      })),
  );
  const knownRuns = [...(await readActiveRuns(others, scope)), ...liveRuns];

  const merged = scoreResults([
    ...knownRuns.map(({ engine, run }) => ({
      results: run.results,
      multiplier: engine.score,
    })),
    { results: newResults, multiplier: retried?.score ?? 1 },
  ]);
  const engineTimings = [...knownRuns.map(({ run }) => run.timing), timing];

  const settings = await getInstanceSettings();
  const displayMerged = await applyDomainRules(merged);
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
    displayMerged.filter((r) => !isRecalled(r)),
    filtersTag,
  );

  return {
    query,
    type,
    totalTime: timing.time,
    relatedSearches: [],
    timing,
    engineTimings,
    results: signResultThumbnails(
      tagIndexRelation(displayMerged, new Set(indexedUrls)),
    ),
  };
}
