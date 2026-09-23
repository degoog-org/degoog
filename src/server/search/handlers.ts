import { scoreResults, search, searchSingleEngine } from "./index";
import type { SearchParams } from "../types/search";
import { signResultThumbnails } from "../utils/net/proxy-sign";
import { applyDomainRules } from "./domain-rules";
import { resolveSearchOverrides } from "./overrides";
import { recordIndexBasis } from "./indexing";
import { getInstanceSettings } from "../utils/settings/server-settings";
import { asBoolean } from "../utils/settings/plugin-settings";
import { isRecalled, tagIndexRelation } from "../indexer/store/record";
import { selectActiveEngines } from "./engine-selection";
import {
  isCacheable,
  readActiveRuns,
  type RunScope,
} from "./engine-cache";

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

  const {
    query,
    type,
    lang: resolvedLang,
    timeFilter: resolvedTime,
  } = await resolveSearchOverrides(origQ, searchType, lang, timeFilter);

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
  const indexedUrls = await recordIndexBasis(
    asBoolean(settings.degoogIndexerEnabled),
    query,
    type,
    await applyDomainRules(indexBasis),
    { lang: resolvedLang, timeFilter: resolvedTime, dateFrom, dateTo, imageFilter },
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

  const {
    query,
    type,
    lang: resolvedLang,
    timeFilter: resolvedTime,
  } = await resolveSearchOverrides(origQ, searchType, lang, timeFilter);

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
  const isRetried = (entry: { id: string; instance: { name: string } }): boolean =>
    timing.id ? entry.id === timing.id : entry.instance.name === timing.name;
  const retried = active.find(isRetried);
  const others = active.filter((e) => !isRetried(e));

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
  const indexedUrls = await recordIndexBasis(
    asBoolean(settings.degoogIndexerEnabled),
    query,
    type,
    displayMerged.filter((r) => !isRecalled(r)),
    { lang: resolvedLang, timeFilter: resolvedTime, dateFrom, dateTo, imageFilter },
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
