import { DEGOOG_ENGINE_NAME, type EngineTiming } from "../../shared/search-types";
import type { ImageFilter, SearchType, TimeFilter } from "../types/search";
import {
  CachedEngineRun,
  SHORT_TTL_MS,
  TTL_MS,
  engineErrored,
  engineRunCache,
} from "../utils/cache/cache";
import { logger } from "../utils/logger";
import {
  engineFingerprint,
  engineQuery,
  type ActiveEngine,
  type SearchInputs,
} from "./engine-selection";
import { ENGINE_INPUT } from "../../shared/engine-input";

const NS = "engine-cache";

export interface RunScope {
  query: string;
  type: SearchType;
  page: number;
  timeFilter: TimeFilter;
  lang?: string;
  dateFrom?: string;
  dateTo?: string;
  imageFilter?: ImageFilter;
  image?: string;
  region?: string;
}

const _imageKey = (filter?: ImageFilter): string =>
  filter
    ? `${filter.color || ""}|${filter.size || ""}|${filter.type || ""}|${filter.layout || ""}|${filter.nsfw || ""}`
    : "";

export const isCacheable = (engineName: string): boolean =>
  engineName !== DEGOOG_ENGINE_NAME;

export const runKey = async (
  engineId: string,
  scope: RunScope,
): Promise<string> => {
  const q = scope.query.trim().toLowerCase();
  const fingerprint = await engineFingerprint(engineId);
  const key = [
    engineId,
    q,
    scope.type,
    scope.page,
    scope.timeFilter,
    scope.lang ?? "",
    scope.dateFrom ?? "",
    scope.dateTo ?? "",
    _imageKey(scope.imageFilter),
    scope.image ?? "",
    fingerprint,
  ].join("|");
  return scope.region ? `${key}|region=${scope.region}` : key;
};

export const runTtl = (timing: EngineTiming): number =>
  engineErrored(timing.status) ? SHORT_TTL_MS : TTL_MS;

const _isRun = (value: unknown): value is CachedEngineRun => {
  if (!value || typeof value !== "object") return false;
  const { results, timing } = value as Partial<CachedEngineRun>;
  if (!Array.isArray(results)) return false;
  if (!timing || typeof timing !== "object") return false;
  return (
    typeof timing.name === "string" &&
    typeof timing.time === "number" &&
    typeof timing.resultCount === "number"
  );
};

export const readRun = async (key: string): Promise<CachedEngineRun | null> => {
  const hit = await engineRunCache.get(key);
  if (hit === null) return null;
  if (_isRun(hit)) return hit;
  logger.debug(NS, "discarded a cached run that no longer matches the shape");
  return null;
};

interface CachedActiveRun {
  engine: ActiveEngine;
  run: CachedEngineRun;
}

export const engineScope = (
  engine: Pick<ActiveEngine, "input">,
  scope: RunScope,
  inputs: SearchInputs = {},
): RunScope => ({
  ...scope,
  query: engineQuery(engine.input, scope.query, inputs),
  image: engine.input === ENGINE_INPUT.IMAGE ? inputs.image?.hash : undefined,
});

export const readActiveRuns = async (
  active: ActiveEngine[],
  scope: RunScope,
  inputs: SearchInputs = {},
): Promise<CachedActiveRun[]> => {
  const found = await Promise.all(
    active.map(async (engine) => {
      if (!isCacheable(engine.instance.name)) return null;
      const run = await readRun(await runKey(engine.id, engineScope(engine, scope, inputs)));
      return run ? { engine, run } : null;
    }),
  );
  return found.filter((entry): entry is CachedActiveRun => entry !== null);
};

export const saveRun = async (
  key: string,
  run: CachedEngineRun,
): Promise<void> => {
  await engineRunCache.set(key, run, runTtl(run.timing));
  logger.debug(
    NS,
    `stored engine="${run.timing.name}" results=${run.timing.resultCount} status=${run.timing.status ?? "ok"} ttl=${runTtl(run.timing)}ms`,
  );
};
