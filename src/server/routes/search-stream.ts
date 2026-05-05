import { Hono } from "hono";
import {
  getActiveWebEngines,
  getEnginesForCustomType,
  getEnginesForSearchType,
} from "../extensions/engines/registry";
import {
  fetchRelatedSearches,
  scoreResults,
  searchSingleEngine,
} from "../search";
import {
  EngineTiming,
  SearchResponse,
  SearchResult,
  SearchType,
  TimeFilter,
} from "../types";
import * as cache from "../utils/cache";
import { asString, getSettings } from "../utils/plugin-settings";
import {
  _applyRateLimit,
  cacheKey,
  DEGOOG_SETTINGS_ID,
  isValidQuery,
  parseEngineConfig,
} from "../utils/search";
import { guardApiKey } from "../utils/api-key-guard";
import { applyDomainRules } from "./search/_domain-rules";
import { signResultThumbnails } from "../utils/proxy-sign";
import { parsePage } from "./search/_parsers";

const router = new Hono();

router.get("/api/search/stream", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;
  const authRes = await guardApiKey(c, "apiKeySearchEnabled");
  if (authRes) return authRes;

  const query = c.req.query("q") ?? "";

  if (!isValidQuery(query))
    return c.json({ error: "Missing or invalid query parameter 'q'" }, 400);

  const searchType = (c.req.query("type") || "web") as SearchType;
  const engines = parseEngineConfig(new URL(c.req.url).searchParams);
  const page = parsePage(c.req.query("page"));
  const timeFilter = (c.req.query("time") || "any") as TimeFilter;
  const lang = c.req.query("lang") || "";
  const dateFrom = c.req.query("dateFrom") || "";
  const dateTo = c.req.query("dateTo") || "";
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
    const liveResults = signResultThumbnails(await applyDomainRules(cached.results));
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
              relatedSearches: cached.relatedSearches,
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

  const settings = await getSettings(DEGOOG_SETTINGS_ID);
  const autoRetry = asString(settings.streamingAutoRetry) === "true";
  const maxRetries = Math.min(
    5,
    Math.max(1, parseInt(asString(settings.streamingMaxRetries) || "2", 10)),
  );

  const builtinTypes = new Set(["web", "images", "videos", "news"]);
  const rawActiveEngines =
    searchType === "web"
      ? await getActiveWebEngines(engines)
      : builtinTypes.has(searchType)
        ? getEnginesForSearchType(searchType, engines).map((e) => ({
            id: e.id,
            instance: e.instance,
            score: 1,
          }))
        : getEnginesForCustomType(searchType).map((e) => ({
            id: e.id,
            instance: e.instance,
            score: 1,
          }));

  if (rawActiveEngines.length === 0) {
    return c.json({
      results: [],
      query,
      totalTime: 0,
      type: searchType,
      engineTimings: [],
      relatedSearches: [],
    });
  }

  const start = performance.now();

  let closed = false;

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
        } catch {
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
              timeFilter,
              lang,
              dateFrom,
              dateTo,
            );
            lastTiming = timing;

            if (timing.resultCount > 0) {
              allRawResults.push({ results, multiplier: score });
              allTimings.push(timing);
              _send("engine-result", {
                engine: engineName,
                timing,
                results: signResultThumbnails(await applyDomainRules(scoreResults(allRawResults))),
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
        let relatedSearches: string[] = [];
        if (searchType === "web" && page === 1) {
          relatedSearches = await fetchRelatedSearches(query).catch(
            () => [] as string[],
          );
        }

        const response: SearchResponse = {
          results: rawScoredResults,
          query,
          totalTime,
          type: searchType,
          engineTimings: allTimings,
          relatedSearches,
        };

        const ttl = cache.hasFailedEngines(response)
          ? cache.SHORT_TTL_MS
          : searchType === "news"
            ? cache.NEWS_TTL_MS
            : undefined;
        cache.set(key, response, ttl);

        _send("done", {
          totalTime,
          engineTimings: allTimings,
          relatedSearches,
        });
        if (!closed) {
          closed = true;
          controller.close();
        }
      });
    },
    cancel() {
      closed = true;
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
