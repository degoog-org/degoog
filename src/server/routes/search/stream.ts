import { Hono, type Context } from "hono";
import { searchSingleEngine } from "../../search";
import { scoreResults } from "../../search/scoring";
import {
  engineQuery,
  selectActiveEngines,
  type ActiveEngine,
  type SearchInputs,
} from "../../search/engine-selection";
import { imageQueryFields, indexesSearch, searchInputsOf } from "../../search/handlers";
import {
  imageQueryProvider,
  queryImage,
  type ImageQueryOutcome,
  type ImageQueryProvider,
} from "../../search/image-query";
import { ENGINE_INPUT } from "../../../shared/engine-input";
import { hasSearchInput, INVALID_IMAGE, rejectsImage } from "../../search/search-image";
import type { SearchBody, SearchImage, SearchParams } from "../../types/search";
import { readObjectBody } from "../../utils/hono";
import { publicBodyLimit } from "../_guards";
import { agreedPageTotal } from "../../search/page-counter";
import {
  DEGOOG_ENGINE_NAME,
  type EngineTiming,
  type ScoredResult,
  type SearchResult,
} from "../../../shared/search-types";
import { logger } from "../../utils/logger";
import { asBoolean, asString } from "../../utils/settings/plugin-settings";
import { _applyRateLimit } from "../../utils/search";
import { resolveSearchOverrides } from "../../search/overrides";
import { recordIndexBasis } from "../../search/indexing";
import { guardApiKey } from "../../utils/security/api-key-guard";
import { applyMergedDomainRules, rewriteEngineRuns } from "../../search/domain-rules";
import { signResultThumbnails } from "../../utils/net/proxy-sign";
import { parseSearchBody, parseSearchRequest } from "./parsers";
import { getInstanceSettings } from "../../utils/settings/server-settings";
import { tagIndexRelation } from "../../indexer/store/record";

const router = new Hono();

const MISSING_QUERY = { error: "Missing or invalid query parameter 'q'" };

const _guard = async (c: Context): Promise<Response | null> =>
  (await _applyRateLimit(c)) ?? (await guardApiKey(c, "apiKeySearchEnabled"));

router.get("/api/search/stream", async (c) => {
  const blocked = await _guard(c);
  if (blocked) return blocked;
  const { origQ, ...params } = parseSearchRequest(c);
  if (!hasSearchInput(origQ)) return c.json(MISSING_QUERY, 400);
  return _streamSearch({ query: origQ, ...params });
});

router.post("/api/search/stream", publicBodyLimit, async (c) => {
  const blocked = await _guard(c);
  if (blocked) return blocked;
  const body = await readObjectBody<SearchBody>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  const parsed = parseSearchBody(body);
  if (rejectsImage(body, parsed)) return c.json(INVALID_IMAGE, 400);
  const query = body.query ?? "";
  if (!hasSearchInput(query, parsed.image)) return c.json(MISSING_QUERY, 400);
  return _streamSearch({ query, ...parsed });
});

async function _streamSearch(params: SearchParams): Promise<Response> {
  const { query: origQ, engines, searchType, page, timeFilter, lang, region, dateFrom, dateTo, imageFilter } = params;
  const inputs = await searchInputsOf(params);
  const provider =
    inputs.image && !inputs.imageQuery ? await imageQueryProvider() : undefined;

  const {
    query,
    type,
    lang: resolvedLang,
    timeFilter: resolvedTime,
  } = await resolveSearchOverrides(origQ, searchType, lang, timeFilter);

  const settings = await getInstanceSettings();
  const autoRetry = asBoolean(settings.streamingAutoRetry);
  const maxRetries = Math.min(
    5,
    Math.max(1, parseInt(asString(settings.streamingMaxRetries) || "2", 10)),
  );

  const rawActiveEngines = await selectActiveEngines(type, engines, imageFilter, inputs);

  const start = performance.now();

  let closed = false;
  const cancelController = new AbortController();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const allTimings: EngineTiming[] = [];
      const allPages: (number | undefined)[] = [];
      const allRawResults: {
        results: SearchResult[];
        multiplier: number;
        name: string;
        visual: boolean;
      }[] = [];

      function _send(event: string, data: unknown) {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        } catch (err) {
          logger.debug("search-stream", "stream client disconnected", err);
          closed = true;
        }
      }

      const merged = async (): Promise<ScoredResult[]> =>
        signResultThumbnails(
          tagIndexRelation(await applyMergedDomainRules(scoreResults(allRawResults))),
        );

      const runEngine = async (
        { instance, score, id, input }: ActiveEngine,
        runInputs: SearchInputs,
      ): Promise<void> => {
          const engineName = instance.name;
          let attempt = 0;
          let lastTiming: EngineTiming = {
            name: engineName,
            id,
            time: 0,
            resultCount: 0,
          };
          let lastPages: number | undefined;

          while (attempt <= (autoRetry ? maxRetries : 0)) {
            if (cancelController.signal.aborted) return;
            const isRetry = attempt > 0;
            const { results, timing, pages } = await searchSingleEngine(
              id,
              engineQuery(input, query, runInputs),
              page,
              resolvedTime,
              resolvedLang,
              dateFrom,
              dateTo,
              imageFilter,
              cancelController.signal,
              type,
              { forceFresh: isRetry, image: runInputs.image, region },
            );
            lastTiming = timing;
            lastPages = pages;

            if (timing.resultCount > 0) {
              allRawResults.push(
                ...(await rewriteEngineRuns([
                  {
                    results,
                    multiplier: score,
                    name: engineName,
                    visual: input === ENGINE_INPUT.IMAGE,
                  },
                ])),
              );
              allTimings.push(timing);
              allPages.push(pages);
              _send("engine-result", {
                engine: engineName,
                timing,
                results: await merged(),
                retry: isRetry,
                attempt,
              });
              return;
            }

            attempt++;
            if (attempt <= (autoRetry ? maxRetries : 0)) {
              _send("engine-retry", {
                engine: engineName,
                attempt,
                maxRetries,
                timing,
              });
            }
          }

          allTimings.push(lastTiming);
          allPages.push(lastPages);
          _send("engine-result", {
            engine: engineName,
            timing: lastTiming,
            results: await merged(),
            retry: false,
            attempt: 0,
          });
      };

      const runAll = (active: ActiveEngine[], runInputs: SearchInputs): Promise<void>[] =>
        active.map((engine) =>
          runEngine(engine, runInputs).catch((err: unknown) => {
            logger.warn("search-stream", `${engine.instance.name} failed mid-stream`, err);
          }),
        );

      let imageOutcome: ImageQueryOutcome = {};
      const describeThenSearch = async (
        describer: ImageQueryProvider,
        image: SearchImage,
      ): Promise<void> => {
        imageOutcome = await queryImage(describer, image, query, {
          lang: resolvedLang,
          signal: cancelController.signal,
        });
        if (cancelController.signal.aborted) return;
        _send("image-query", {
          query: imageOutcome.query ?? null,
          error: imageOutcome.error ?? null,
        });
        if (!imageOutcome.query) return;
        const described = { ...inputs, imageQuery: imageOutcome.query };
        const textEngines = (
          await selectActiveEngines(type, engines, imageFilter, described)
        ).filter((e) => e.input === ENGINE_INPUT.TEXT);
        await Promise.all(runAll(textEngines, described));
      };

      const enginePromises = [
        ...runAll(rawActiveEngines, inputs),
        ...(provider && inputs.image
          ? [
              describeThenSearch(provider, inputs.image).catch((err: unknown) => {
                logger.warn("search-stream", "image query failed mid-stream", err);
              }),
            ]
          : []),
      ];

      void Promise.all(enginePromises)
        .then(async () => {
        const totalTime = Math.round(performance.now() - start);

        const indexerSettings = await getInstanceSettings();
        const indexBasis = await applyMergedDomainRules(
          scoreResults(allRawResults.filter((e) => e.name !== DEGOOG_ENGINE_NAME)),
        );
        const indexedUrls = await recordIndexBasis(
          indexesSearch(asBoolean(indexerSettings.degoogIndexerEnabled), inputs),
          query,
          type,
          indexBasis,
          {
            lang: resolvedLang,
            region,
            timeFilter: resolvedTime,
            dateFrom,
            dateTo,
            imageFilter,
          },
        ).catch((err: unknown) => {
          logger.warn("search-stream", "indexing failed, finishing the stream without it", err);
          return [] as string[];
        });

        _send("done", {
          totalTime,
          engineTimings: allTimings,
          indexedUrls,
          relatedSearches: [],
          totalPages: agreedPageTotal(allPages),
          ...imageQueryFields(
            { ...inputs, imageQuery: inputs.imageQuery ?? imageOutcome.query },
            imageOutcome,
          ),
        });
        })
        .catch((err) => {
          logger.error("search-stream", "stream finalization failed", err);
        })
        .finally(() => {
          if (!closed) {
            closed = true;
            controller.close();
          }
        });
    },
    cancel() {
      closed = true;
      cancelController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export default router;
