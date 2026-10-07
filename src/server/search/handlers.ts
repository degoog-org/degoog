import { search, searchSingleEngine } from "./index";
import { scoreResults } from "./scoring";
import type { SearchParams } from "../types/search";
import { signResultThumbnails } from "../utils/net/proxy-sign";
import { applyMergedDomainRules, rewriteEngineRuns } from "./domain-rules";
import { resolveSearchOverrides } from "./overrides";
import { recordIndexBasis } from "./indexing";
import { getInstanceSettings } from "../utils/settings/server-settings";
import { asBoolean } from "../utils/settings/plugin-settings";
import { tagIndexRelation } from "../indexer/store/record";
import { DEGOOG_ENGINE_NAME } from "../../shared/search-types";
import { engineQuery, selectActiveEngines, type SearchInputs } from "./engine-selection";
import { agreedPageTotal } from "./page-counter";
import { getEngineInput } from "../extensions/engines/catalog";
import {
  canQueryImages,
  imageQueryProvider,
  queryImage,
  type ImageQueryOutcome,
} from "./image-query";
import { ENGINE_INPUT } from "../../shared/engine-input";
import {
  isCacheable,
  readActiveRuns,
  type RunScope,
} from "./engine-cache";

export const searchInputsOf = async (
  params: Pick<SearchParams, "image" | "imageQuery">,
): Promise<SearchInputs> => ({
  image: params.image,
  imageQuery:
    params.image && params.imageQuery && (await canQueryImages())
      ? params.imageQuery
      : undefined,
});

export const withImageQuery = async (
  inputs: SearchInputs,
  text: string,
  lang?: string,
  needsText = true,
): Promise<{ inputs: SearchInputs; outcome: ImageQueryOutcome }> => {
  if (!needsText || !inputs.image || inputs.imageQuery) return { inputs, outcome: {} };
  const provider = await imageQueryProvider();
  if (!provider) return { inputs, outcome: {} };
  const outcome = await queryImage(provider, inputs.image, text, { lang });
  return { inputs: { ...inputs, imageQuery: outcome.query }, outcome };
};

export const imageQueryFields = (
  inputs: SearchInputs,
  outcome: ImageQueryOutcome,
): { imageQuery?: string; imageQueryError?: string } =>
  inputs.image
    ? { imageQuery: inputs.imageQuery, imageQueryError: outcome.error }
    : {};

export const indexesSearch = (indexerOn: boolean, inputs: SearchInputs): boolean =>
  indexerOn && !inputs.image;

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
  const { inputs, outcome } = await withImageQuery(await searchInputsOf(params), query, resolvedLang);

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
    inputs,
  );

  const settings = await getInstanceSettings();

  const displayResults = await applyMergedDomainRules(response.results);
  const indexedUrls = await recordIndexBasis(
    indexesSearch(asBoolean(settings.degoogIndexerEnabled), inputs),
    query,
    type,
    await applyMergedDomainRules(indexBasis),
    { lang: resolvedLang, timeFilter: resolvedTime, dateFrom, dateTo, imageFilter },
  );

  return {
    ...response,
    ...imageQueryFields(inputs, outcome),
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
  const { inputs, outcome } = await withImageQuery(
    await searchInputsOf(params),
    query,
    resolvedLang,
    getEngineInput(engineName) === ENGINE_INPUT.TEXT,
  );

  const {
    results: newResults,
    timing,
    pages: retriedPages,
  } = await searchSingleEngine(
    engineName,
    engineQuery(getEngineInput(engineName), query, inputs),
    page,
    resolvedTime,
    resolvedLang,
    dateFrom,
    dateTo,
    imageFilter,
    undefined,
    type,
    { forceFresh: true, image: inputs.image },
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
  const active = await selectActiveEngines(type, engines, imageFilter, inputs);
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
          engineQuery(engine.input, query, inputs),
          page,
          resolvedTime,
          resolvedLang,
          dateFrom,
          dateTo,
          imageFilter,
          undefined,
          type,
          { image: inputs.image },
        ),
      })),
  );
  const knownRuns = [...(await readActiveRuns(others, scope, inputs)), ...liveRuns];

  const runs = await rewriteEngineRuns([
    ...knownRuns.map(({ engine, run }) => ({
      results: run.results,
      multiplier: engine.score,
      name: engine.instance.name,
      visual: engine.input === ENGINE_INPUT.IMAGE,
    })),
    {
      results: newResults,
      multiplier: retried?.score ?? 1,
      name: timing.name,
      visual: getEngineInput(engineName) === ENGINE_INPUT.IMAGE,
    },
  ]);
  const merged = scoreResults(runs);
  const engineTimings = [...knownRuns.map(({ run }) => run.timing), timing];

  const settings = await getInstanceSettings();
  const displayMerged = await applyMergedDomainRules(merged);
  const indexedUrls = await recordIndexBasis(
    indexesSearch(asBoolean(settings.degoogIndexerEnabled), inputs),
    query,
    type,
    await applyMergedDomainRules(
      scoreResults(runs.filter((r) => r.name !== DEGOOG_ENGINE_NAME)),
    ),
    { lang: resolvedLang, timeFilter: resolvedTime, dateFrom, dateTo, imageFilter },
  );

  return {
    query,
    type,
    totalTime: timing.time,
    relatedSearches: [],
    ...imageQueryFields(inputs, outcome),
    timing,
    engineTimings,
    totalPages: agreedPageTotal([
      ...others.map(
        (engine) => knownRuns.find((known) => known.engine === engine)?.run.pages,
      ),
      retriedPages,
    ]),
    results: signResultThumbnails(
      tagIndexRelation(displayMerged, new Set(indexedUrls)),
    ),
  };
}
