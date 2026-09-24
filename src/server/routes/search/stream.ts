import { Hono } from "hono";
import {
  scoreResults,
  searchSingleEngine,
} from "../../search";
import { selectActiveEngines } from "../../search/engine-selection";
import { agreedPageTotal } from "../../search/page-counter";
import {
  DEGOOG_ENGINE_NAME,
  type EngineTiming,
  type ScoredResult,
  type SearchResult,
} from "../../../shared/search-types";
import { logger } from "../../utils/logger";
import { asBoolean, asString } from "../../utils/settings/plugin-settings";
import { _applyRateLimit, isValidQuery } from "../../utils/search";
import { resolveSearchOverrides } from "../../search/overrides";
import { recordIndexBasis } from "../../search/indexing";
import { guardApiKey } from "../../utils/security/api-key-guard";
import { applyDomainRules } from "../../search/domain-rules";
import { signResultThumbnails } from "../../utils/net/proxy-sign";
import { parseSearchRequest } from "./parsers";
import { getInstanceSettings } from "../../utils/settings/server-settings";
import { tagIndexRelation } from "../../indexer/store/record";

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

  const rawActiveEngines = await selectActiveEngines(type, engines, imageFilter);

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
      const allPages: (number | undefined)[] = [];
      const allRawResults: {
        results: SearchResult[];
        multiplier: number;
        name: string;
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
          tagIndexRelation(await applyDomainRules(scoreResults(allRawResults))),
        );

      const enginePromises = rawActiveEngines.map(
        async ({ instance, score, id }) => {
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
            const isRetry = attempt > 0;
            const { results, timing, pages } = await searchSingleEngine(
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
              { forceFresh: isRetry },
            );
            lastTiming = timing;
            lastPages = pages;

            if (timing.resultCount > 0) {
              allRawResults.push({ results, multiplier: score, name: engineName });
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
        },
      );

      void Promise.all(enginePromises)
        .then(async () => {
        const totalTime = Math.round(performance.now() - start);

        const indexerSettings = await getInstanceSettings();
        const indexBasis = await applyDomainRules(
          scoreResults(allRawResults.filter((e) => e.name !== DEGOOG_ENGINE_NAME)),
        );
        const indexedUrls = await recordIndexBasis(
          asBoolean(indexerSettings.degoogIndexerEnabled),
          query,
          type,
          indexBasis,
          {
            lang: resolvedLang,
            timeFilter: resolvedTime,
            dateFrom,
            dateTo,
            imageFilter,
          },
        );

        _send("done", {
          totalTime,
          engineTimings: allTimings,
          indexedUrls,
          relatedSearches: [],
          totalPages: agreedPageTotal(allPages),
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
});

export default router;
