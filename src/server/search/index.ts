import { getEngineIdByInstance, getEngineMap } from "../extensions/engines/catalog";
import { selectActiveEngines } from "./engine-selection";
import {
  isCacheable,
  readRun,
  runKey,
  saveRun,
  type RunScope,
} from "./engine-cache";
import {
  agreedPageTotal,
  makePageCounter,
  sanePage,
} from "./page-counter";
import type { CachedEngineRun } from "../utils/cache/cache";
import type { SearchEngine } from "../types/extension";
import type {
  EngineConfig,
  ImageFilter,
  SearchType,
  TimeFilter,
} from "../types/search";
import {
  DEGOOG_ENGINE_NAME,
  type EngineTiming,
  type ScoredResult,
  type SearchResponse,
} from "../../shared/search-types";

import {
  THREAT_LEVEL,
  isSentinelBreach,
  type ThreatLevel,
} from "../utils/security/sentinel";
import { logger } from "../utils/logger";
import { reportEngineRun } from "../utils/extension-support/run-observers";
import { createSearchEngineContext } from "./engine-context";
import { getEngineTimeout } from "./engine-timeout";
import { scoreResults } from "./scoring";

const _withTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  onTimeout?: () => void,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error("Engine timeout"));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const _classifyReject = (
  err: unknown,
): { status: string; httpStatus?: number; reason: string } => {
  if (isSentinelBreach(err)) {
    return {
      status: err.status,
      httpStatus: err.httpStatus,
      reason: err.message,
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/timeout/i.test(msg)) {
    return { status: THREAT_LEVEL.TIMEOUT, reason: msg };
  }
  return { status: THREAT_LEVEL.NETWORK, reason: msg };
};

const resolveEngine = (engineName: string): SearchEngine | null => {
  const engineMap = getEngineMap();
  if (engineMap[engineName]) return engineMap[engineName];
  for (const engine of Object.values(engineMap)) {
    if (engine.name === engineName) return engine;
  }
  return null;
};

const _keepRun = async (key: string, run: CachedEngineRun): Promise<void> => {
  if (!key) return;
  try {
    await saveRun(key, run);
  } catch (err) {
    logger.warn("engine", `cache write failed for "${run.timing.name}"`, err);
  }
};

const _tellObservers = (
  timing: EngineTiming,
  engineId: string | undefined,
  scope: RunScope,
  cached: boolean,
): void => {
  reportEngineRun({
    engine: timing.name,
    engineId,
    searchType: scope.type,
    page: scope.page,
    time: timing.time,
    resultCount: timing.resultCount,
    status: (timing.status as ThreatLevel | undefined) ?? THREAT_LEVEL.OK,
    errorReason: timing.errorReason,
    httpStatus: timing.httpStatus,
    cached,
    at: Date.now(),
  });
};

export const searchSingleEngine = async (
  engineName: string,
  query: string,
  page: number = 1,
  timeFilter: TimeFilter = "any",
  lang?: string,
  dateFrom?: string,
  dateTo?: string,
  imageFilter?: ImageFilter,
  signal?: AbortSignal,
  searchType?: SearchType,
  opts?: { forceFresh?: boolean },
): Promise<CachedEngineRun> => {
  const engine = resolveEngine(engineName);
  if (!engine) {
    return {
      results: [],
      timing: { name: engineName, id: engineName, time: 0, resultCount: 0, status: THREAT_LEVEL.BLOCKED },
    };
  }
  const p = sanePage(page);
  const t0 = performance.now();
  const engineSettingsId = getEngineIdByInstance(engine);
  const cacheId = engineSettingsId ?? engine.name;
  const scope: RunScope = {
    query,
    type: searchType ?? "web",
    page: p,
    timeFilter,
    lang,
    dateFrom,
    dateTo,
    imageFilter,
  };
  const key = isCacheable(engine.name)
    ? await runKey(cacheId, scope).catch((err) => {
        logger.warn("engine", `cache key failed for "${engine.name}", running uncached`, err);
        return "";
      })
    : "";
  const cacheable = key !== "";

  if (cacheable && !opts?.forceFresh) {
    const hit = await readRun(key).catch((err) => {
      logger.warn("engine", `cache read failed for "${engine.name}", running fresh`, err);
      return null;
    });
    if (hit) {
      logger.debug(
        "engine",
        `cache hit engine="${engine.name}" results=${hit.timing.resultCount} status=${hit.timing.status ?? "ok"}`,
      );
      _tellObservers(hit.timing, engineSettingsId, scope, true);
      return { ...hit, timing: { ...hit.timing, id: engineSettingsId } };
    }
  }

  const ac = new AbortController();
  if (signal) {
    if (signal.aborted) ac.abort();
    else signal.addEventListener("abort", () => ac.abort(), { once: true });
  }
  const pageCounter = makePageCounter();
  const engineContext = createSearchEngineContext(engineSettingsId, {
    lang,
    dateFrom,
    dateTo,
    imageFilter,
    signal: ac.signal,
    searchType,
    pageCounter,
  });
  try {
    const timeout = await getEngineTimeout(engineSettingsId);
    const results = await _withTimeout(
      engine.executeSearch(query, p, timeFilter, engineContext),
      timeout,
      () => ac.abort(),
    );
    const elapsed = Math.round(performance.now() - t0);
    const run: CachedEngineRun = {
      results,
      timing: {
        name: engine.name,
        id: engineSettingsId,
        time: elapsed,
        resultCount: results.length,
        status: THREAT_LEVEL.OK,
      },
      pages: pageCounter.total(),
    };
    _tellObservers(run.timing, engineSettingsId, scope, false);
    await _keepRun(key, run);
    return run;
  } catch (err) {
    const elapsed = Math.round(performance.now() - t0);
    const classified = _classifyReject(err);
    logger.warn("engine", `${engine.name} failed after ${elapsed}ms status=${classified.status}`, err);
    const run: CachedEngineRun = {
      results: [],
      timing: { name: engine.name, id: engineSettingsId, time: elapsed, resultCount: 0, status: classified.status, errorReason: classified.reason, httpStatus: classified.httpStatus },
    };
    _tellObservers(run.timing, engineSettingsId, scope, false);
    await _keepRun(key, run);
    return run;
  }
};

export const search = async (
  query: string,
  config: EngineConfig,
  type: SearchType = "web",
  page: number = 1,
  timeFilter: TimeFilter = "any",
  lang?: string,
  dateFrom?: string,
  dateTo?: string,
  imageFilter?: ImageFilter,
): Promise<SearchResponse & { indexBasis: ScoredResult[] }> => {
  const start = performance.now();
  const p = sanePage(page);

  const rawActiveEngines = await selectActiveEngines(type, config, imageFilter);

  if (rawActiveEngines.length === 0) {
    return {
      results: [],
      query,
      totalTime: 0,
      type,
      engineTimings: [],
      relatedSearches: [],
      indexBasis: [],
    };
  }

  const runs = await Promise.all(
    rawActiveEngines.map(({ id }) =>
      searchSingleEngine(
        id,
        query,
        p,
        timeFilter,
        lang,
        dateFrom,
        dateTo,
        imageFilter,
        undefined,
        type,
      ),
    ),
  );

  const allResults = runs.map((run, i) => ({
    results: run.results,
    multiplier: rawActiveEngines[i].score,
    name: run.timing.name,
  }));
  const engineTimings: EngineTiming[] = runs.map((run) => run.timing);

  const scored = scoreResults(allResults);
  const indexBasis = scoreResults(
    allResults.filter((e) => e.name !== DEGOOG_ENGINE_NAME),
  );
  const totalTime = Math.round(performance.now() - start);

  return {
    results: scored,
    query,
    totalTime,
    type,
    engineTimings,
    relatedSearches: [],
    totalPages: agreedPageTotal(runs.map((run) => run.pages)),
    indexBasis,
  };
};
