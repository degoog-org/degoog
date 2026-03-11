export const BURST_WINDOW_SEC = 20;
export const BURST_MAX = 15;
export const LONG_WINDOW_SEC = 600;
export const LONG_MAX = 150;

const WINDOW_MIN_SEC = 1;
const WINDOW_MAX_SEC = 3600;
const MAX_REQUESTS_MIN = 1;
const MAX_REQUESTS_MAX = 1000;

export type RateLimitOptions = Record<string, string | undefined>;

const _parseNum = (
  value: string | undefined,
  min: number,
  max: number,
  fallback: number,
): number => {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return Math.floor(n);
};

export const parseRateLimitOptions = (
  options: RateLimitOptions,
): {
  burstWindowSec: number;
  burstMax: number;
  longWindowSec: number;
  longMax: number;
} => ({
  burstWindowSec: _parseNum(
    options.rateLimitBurstWindow,
    WINDOW_MIN_SEC,
    WINDOW_MAX_SEC,
    BURST_WINDOW_SEC,
  ),
  burstMax: _parseNum(
    options.rateLimitBurstMax,
    MAX_REQUESTS_MIN,
    MAX_REQUESTS_MAX,
    BURST_MAX,
  ),
  longWindowSec: _parseNum(
    options.rateLimitLongWindow,
    WINDOW_MIN_SEC,
    WINDOW_MAX_SEC,
    LONG_WINDOW_SEC,
  ),
  longMax: _parseNum(
    options.rateLimitLongMax,
    MAX_REQUESTS_MIN,
    MAX_REQUESTS_MAX,
    LONG_MAX,
  ),
});

const store = new Map<string, number[]>();
const MAX_IPS = 100_000;

const _pruneAndCount = (
  timestamps: number[],
  now: number,
  burstWindowSec: number,
  longWindowSec: number,
): { burstCount: number; longCount: number; oldestInBurst: number | null } => {
  const longCutoff = now - longWindowSec * 1000;
  const burstCutoff = now - burstWindowSec * 1000;
  let burstCount = 0;
  let longCount = 0;
  let oldestInBurst: number | null = null;
  for (const t of timestamps) {
    if (t < longCutoff) continue;
    longCount++;
    if (t >= burstCutoff) {
      burstCount++;
      if (oldestInBurst === null || t < oldestInBurst) oldestInBurst = t;
    }
  }
  return { burstCount, longCount, oldestInBurst };
};

export const checkRateLimit = (
  ip: string,
  options: RateLimitOptions,
): { allowed: boolean; retryAfterSec?: number } => {
  if (options.rateLimitEnabled !== "true") {
    return { allowed: true };
  }

  const { burstWindowSec, burstMax, longWindowSec, longMax } =
    parseRateLimitOptions(options);
  const now = Date.now();
  const key = ip || "unknown";

  let timestamps = store.get(key);
  if (!timestamps) {
    timestamps = [];
    if (store.size >= MAX_IPS) {
      let oldestKey: string | null = null;
      let oldestMin = Infinity;
      for (const [k, ts] of store) {
        const minT = Math.min(...ts);
        if (minT < oldestMin) {
          oldestMin = minT;
          oldestKey = k;
        }
      }
      if (oldestKey !== null) store.delete(oldestKey);
    }
    store.set(key, timestamps);
  }

  timestamps.push(now);
  const longCutoff = now - longWindowSec * 1000;
  while (timestamps.length > 0 && timestamps[0] < longCutoff) {
    timestamps.shift();
  }
  if (timestamps.length === 0) {
    store.delete(key);
    return { allowed: true };
  }

  const { burstCount, longCount, oldestInBurst } = _pruneAndCount(
    timestamps,
    now,
    burstWindowSec,
    longWindowSec,
  );

  if (longCount > longMax) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((timestamps[0] + longWindowSec * 1000 - now) / 1000),
    );
    return { allowed: false, retryAfterSec };
  }

  if (burstCount > burstMax) {
    const retryAfterSec =
      oldestInBurst !== null
        ? Math.max(
            1,
            Math.ceil((oldestInBurst + burstWindowSec * 1000 - now) / 1000),
          )
        : burstWindowSec;
    return { allowed: false, retryAfterSec };
  }

  return { allowed: true };
};

export function clearRateLimitState(): void {
  store.clear();
}
