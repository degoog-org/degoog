import type { ScoredResult } from "../types";
import { logger } from "./logger";

const PROBE_TIMEOUT_MS = 3000;
const BLOCK_MS = 400;
const CACHE_MAX = 5000;

const _cache = new Map<string, boolean>();
const _inflight = new Map<string, Promise<boolean>>();

const _remember = (url: string, alive: boolean): boolean => {
  if (_cache.size >= CACHE_MAX) _cache.clear();
  _cache.set(url, alive);
  return alive;
};

const PRIVATE_HOST =
  /^(localhost$|.*\.local$|\[?::1\]?$|\[?f[cde].*|0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i;

const _isPublicHttp = (url: string): boolean => {
  try {
    const u = new URL(url);
    return (
      (u.protocol === "https:" || u.protocol === "http:") &&
      !PRIVATE_HOST.test(u.hostname)
    );
  } catch {
    return false;
  }
};

const DEAD_STATUS = new Set([404, 410, 451, 500, 502, 503, 504]);

const _isTimeout = (err: unknown): boolean =>
  err instanceof Error &&
  (err.name === "TimeoutError" || err.name === "AbortError");

const _probe = async (url: string): Promise<boolean> => {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return _remember(url, !DEAD_STATUS.has(res.status));
  } catch (err) {
    if (_isTimeout(err)) return _remember(url, true);
    return _remember(url, false);
  }
};

const _isAlive = (url: string): boolean | Promise<boolean> => {
  const cached = _cache.get(url);
  if (cached !== undefined) return cached;
  if (!_isPublicHttp(url)) return _remember(url, true);
  const running = _inflight.get(url);
  if (running) return running;
  const p = _probe(url).finally(() => _inflight.delete(url));
  _inflight.set(url, p);
  return p;
};

export const filterDeadLinks = async (
  results: ScoredResult[],
): Promise<ScoredResult[]> => {
  const alive = results.map(() => true);
  const verdicts = results.map(async (r, i) => {
    alive[i] = await _isAlive(r.url);
  });
  let timer: ReturnType<typeof setTimeout>;
  await Promise.race([
    Promise.all(verdicts),
    new Promise((resolve) => {
      timer = setTimeout(resolve, BLOCK_MS);
    }),
  ]).finally(() => clearTimeout(timer));
  const kept = results.filter((_, i) => alive[i]);
  if (results.length >= 4 && kept.length * 2 < results.length) {
    _cache.clear();
    logger.warn(
      "dead-links",
      `${results.length - kept.length}/${results.length} probes failed - assuming local network fault, keeping all`,
    );
    return results;
  }
  if (kept.length !== results.length) {
    logger.debug(
      "dead-links",
      `dropped ${results.length - kept.length}/${results.length} 404 results`,
    );
  }
  return kept;
};
