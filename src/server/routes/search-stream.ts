import { Hono } from "hono";
import {
  scoreResults,
  searchSingleEngine,
} from "../search";
import { selectActiveEngines, engineSettingsFingerprint } from "../search/engine-selection";
import {
  EngineTiming,
  SearchResponse,
  SearchResult,
  SearchType,
  TimeFilter,
} from "../types";
import * as cache from "../utils/cache";
import { logger } from "../utils/logger";
import { asBoolean, asString } from "../utils/plugin-settings";
import {
  _applyRateLimit,
  cacheKey,
  isValidQuery,
} from "../utils/search";
import { guardApiKey } from "../utils/api-key-guard";
import { applyDomainRules } from "./search/_domain-rules";
import { signResultThumbnails } from "../utils/proxy-sign";
import { parseSearchRequest } from "./search/_parsers";
import { runIntercepts } from "../utils/run-interceptors";
import { getInstanceSettings } from "../utils/server-settings";
import { DEGOOG_ENGINE_NAME, maybeIndex } from "../indexer/store";

const router = new Hono();

router.get("/api/search/stream", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;
  const authRes = await guardApiKey(c, "apiKeySearchEnabled");
  if (authRes) return authRes;

  const { origQ, ...params } = parseSearchRequest(c);

  if (!isValidQuery(origQ))
    return c.json({ error: "Missing or invalid query parameter 'q'" }, 400);

  const { engines, searchType, page, timeFilter, lang, dateFrom, dateTo, imageFilter } = params;

  const { query, overrides } = await runIntercepts(origQ, lang);
  const type = (overrides.searchType ?? searchType) as SearchType;
  const resolvedLang = overrides.lang ?? lang;
  const resolvedTime = (overrides.timeFilter ?? timeFilter) as TimeFilter;

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
      "search-stream",
      `cache hit q="${qShort}" type=${type} page=${page} enginesOn=${enginesOn} results=${cached.results.length} timings=${cached.engineTimings.length}`,
    );
    const liveResults = signResultThumbnails(
      await applyDomainRules(cached.results),
    );
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        for (const et of cached.engineTimings) {
          controller.enqueue(
            encoder.encode(
              `event: engine-result\ndata: ${JSON.stringify({
                engine: et.name,
                timing: et,
                results: liveResults,
                retry: false,
                attempt: 0,
              })}\n\n`,
            ),
          );
        }
        controller.enqueue(
          encoder.encode(
            `event: done\ndata: ${JSON.stringify({
              totalTime: cached.totalTime,
              engineTimings: cached.engineTimings,
              relatedSearches: [],
            })}\n\n`,
          ),
        );
        controller.close();
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const settings = await getInstanceSettings();
  const autoRetry = asBoolean(settings.streamingAutoRetry);
  const maxRetries = Math.min(
    5,
    Math.max(1, parseInt(asString(settings.streamingMaxRetries) || "2", 10)),
  );

  const rawActiveEngines = await selectActiveEngines(type, engines);

  if (rawActiveEngines.length === 0) {
    return c.json({
      results: [],
      query,
      totalTime: 0,
      type,
      engineTimings: [],
      relatedSearches: [],
    });
  }

  const start = performance.now();

  let closed = false;
  const cancelController = new AbortController();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const allTimings: EngineTiming[] = [];
      const allRawResults: {
        results: SearchResult[];
        multiplier: number;
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

      const enginePromises = rawActiveEngines.map(
        async ({ instance, score, id }) => {
          const engineName = instance.name;
          let attempt = 0;
          let lastTiming: EngineTiming = {
            name: engineName,
            time: 0,
            resultCount: 0,
          };

          while (attempt <= (autoRetry ? maxRetries : 0)) {
            const isRetry = attempt > 0;
            const { results, timing } = await searchSingleEngine(
              id,
              query,
              page,
              resolvedTime,
              resolvedLang,
              dateFrom,
              dateTo,
              imageFilter,
              cancelController.signal,
              type,
            );
            lastTiming = timing;

            if (timing.resultCount > 0) {
              allRawResults.push({ results, multiplier: score });
              allTimings.push(timing);
              _send("engine-result", {
                engine: engineName,
                timing,
                results: signResultThumbnails(
                  await applyDomainRules(scoreResults(allRawResults)),
                ),
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
          _send("engine-result", {
            engine: engineName,
            timing: lastTiming,
            results: await applyDomainRules(scoreResults(allRawResults)),
            retry: false,
            attempt: 0,
          });
        },
      );

      void Promise.all(enginePromises).then(async () => {
        const totalTime = Math.round(performance.now() - start);
        const rawScoredResults = scoreResults(allRawResults);

        const response: SearchResponse = {
          results: rawScoredResults,
          query,
          totalTime,
          type,
          engineTimings: allTimings,
          relatedSearches: [],
        };

        const indexerSettings = await getInstanceSettings();
        const displayResults = await applyDomainRules(rawScoredResults);
        const indexed = maybeIndex(
          asBoolean(indexerSettings.degoogIndexerEnabled),
          query,
          type,
          displayResults,
        );

        const degoogTiming = allTimings.find((et) => et.name === DEGOOG_ENGINE_NAME);
        const justIndexed = indexed && degoogTiming?.resultCount === 0;

        if (justIndexed) {
          const idx = allTimings.indexOf(degoogTiming!);
          allTimings[idx] = { ...degoogTiming!, indexed: true };
        }

        if (!cache.allEnginesFailed(response)) {
          const ttl = justIndexed
            ? cache.JUST_INDEXED_TTL_MS
            : cache.someEnginesFailed(response)
              ? cache.SHORT_TTL_MS
              : undefined;
          await cache.set(key, response, ttl);
        }

        _send("done", {
          totalTime,
          engineTimings: allTimings,
          relatedSearches: [],
        });
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
});

export default router;
