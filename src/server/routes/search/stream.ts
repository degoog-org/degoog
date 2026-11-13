import { Hono, type Context } from "hono";
import { ENGINE_TIMEOUT_REASON, searchSingleEngine } from "../../search";
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

interface RawEngineRun {
  results: SearchResult[];
  multiplier: number;
  name: string;
  visual: boolean;
}

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
      const allRawResults: RawEngineRun[] = [];
      const partialRuns = new Map<string, RawEngineRun[]>();

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
          tagIndexRelation(
            await applyMergedDomainRules(
              scoreResults([...allRawResults, ...[...partialRuns.values()].flat()]),
            ),
          ),
        );

      let waiting = 0;
      let settledSent = false;
      const emittingNow = new Set<string>();

      const checkSettled = (): void => {
        if (settledSent || waiting > 0 || emittingNow.size === 0) return;
        settledSent = true;
        _send("results-settled", {});
      };

      const hold = (): (() => void) => {
        waiting++;
        let held = true;
        return () => {
          if (!held) return;
          held = false;
          waiting--;
        };
      };

      const engineHold = (id: string): { emitting: () => void; done: () => void } => {
        const release = hold();
        return {
          emitting: () => {
            release();
            emittingNow.add(id);
            checkSettled();
          },
          done: () => {
            release();
            emittingNow.delete(id);
            checkSettled();
          },
        };
      };

      const partialFeed = (
        toRun: (results: SearchResult[]) => RawEngineRun,
        id: string,
        onSent: () => void,
      ): {
        onPartial: (results: SearchResult[], expected?: number) => void;
        settle: () => void;
      } => {
        let settled = false;
        let busy = false;
        let latest: { results: SearchResult[]; expected?: number } | null = null;
        const engineName = toRun([]).name;

        const flush = async (): Promise<void> => {
          if (busy) return;
          busy = true;
          try {
            while (latest && !settled && !closed) {
              const snapshot = latest;
              latest = null;
              const rewritten = await rewriteEngineRuns([toRun(snapshot.results)]);
              if (settled) return;
              partialRuns.set(engineName, rewritten);
              const results = await merged();
              if (settled) return;
              _send("engine-partial", {
                engine: engineName,
                id,
                emitted: snapshot.results.length,
                ...(snapshot.expected ? { expected: snapshot.expected } : {}),
                results,
              });
              onSent();
            }
          } finally {
            busy = false;
          }
        };

        return {
          onPartial: (results: SearchResult[], expected?: number): void => {
            latest = { results, expected };
            flush().catch((err: unknown) => {
              logger.debug("search-stream", `${engineName} partial update failed`, err);
            });
          },
          settle: (): void => {
            settled = true;
            partialRuns.delete(engineName);
          },
        };
      };

      const runEngine = async (
        { instance, score, id, input }: ActiveEngine,
        runInputs: SearchInputs,
        onEmitting: () => void,
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
            const toRun = (results: SearchResult[]): RawEngineRun => ({
              results,
              multiplier: score,
              name: engineName,
              visual: input === ENGINE_INPUT.IMAGE,
            });
            const feed = partialFeed(toRun, id, onEmitting);
            const { results, timing, pages, cached } = await searchSingleEngine(
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
              {
                forceFresh: isRetry,
                image: runInputs.image,
                region,
                onPartial: feed.onPartial,
              },
            ).catch((err: unknown) => {
              feed.settle();
              throw err;
            });
            lastTiming = timing;
            lastPages = pages;

            if (timing.resultCount > 0) {
              const rewritten = await rewriteEngineRuns([toRun(results)]);
              feed.settle();
              allRawResults.push(...rewritten);
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
            feed.settle();

            if (!cached && timing.errorReason === ENGINE_TIMEOUT_REASON) break;
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
        active.map((engine) => {
          const held = engineHold(engine.id);
          return runEngine(engine, runInputs, held.emitting)
            .catch((err: unknown) => {
              logger.warn("search-stream", `${engine.instance.name} failed mid-stream`, err);
            })
            .finally(held.done);
        });

      let imageOutcome: ImageQueryOutcome = {};
      const describeThenSearch = async (
        describer: ImageQueryProvider,
        image: SearchImage,
      ): Promise<void> => {
        const release = hold();
        try {
          await describeAndLaunch(describer, image, release);
        } finally {
          release();
          checkSettled();
        }
      };

      const describeAndLaunch = async (
        describer: ImageQueryProvider,
        image: SearchImage,
        launched: () => void,
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
        const running = Promise.all(runAll(textEngines, described));
        launched();
        await running;
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

      function _sendDone(totalTime: number, indexedUrls: string[]): void {
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
      }

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

        _sendDone(totalTime, indexedUrls);
        })
        .catch((err: unknown) => {
          logger.error("search-stream", "stream finalization failed, sending done without indexing", err);
          _sendDone(Math.round(performance.now() - start), []);
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
