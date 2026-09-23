/**
 * @fccview here
 * Been watching The Matrix lately.. don't judge.
 */

export const THREAT_LEVEL = {
  OK: "ok",
  BLOCKED: "blocked",
  RATE_LIMITED: "rate_limited",
  CAPTCHA: "captcha",
  PARSE_ERROR: "parse_error",
  TIMEOUT: "timeout",
  NETWORK: "network",
  INTERSTITIAL: "interstitial",
} as const;

export type ThreatLevel = (typeof THREAT_LEVEL)[keyof typeof THREAT_LEVEL];

const ENGINE_ERROR_NAME = "SentinelBreach";

export class SentinelBreach extends Error {
  readonly status: ThreatLevel;
  readonly httpStatus?: number;
  readonly engine?: string;

  constructor(
    status: ThreatLevel,
    message: string,
    opts?: { httpStatus?: number; engine?: string; cause?: unknown },
  ) {
    super(message);
    this.name = ENGINE_ERROR_NAME;
    this.status = status;
    this.httpStatus = opts?.httpStatus;
    this.engine = opts?.engine;
    if (opts?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = opts.cause;
    }
  }
}

export const isSentinelBreach = (e: unknown): e is SentinelBreach =>
  e instanceof SentinelBreach ||
  (typeof e === "object" &&
    e !== null &&
    (e as { name?: string }).name === ENGINE_ERROR_NAME &&
    typeof (e as { status?: unknown }).status === "string");

export const evaluateThreat = (httpStatus: number): ThreatLevel => {
  if (httpStatus === 429) return THREAT_LEVEL.RATE_LIMITED;
  if (httpStatus === 403) return THREAT_LEVEL.BLOCKED;
  if (httpStatus >= 500) return THREAT_LEVEL.NETWORK;
  return THREAT_LEVEL.BLOCKED;
};

/**
 * Just giving some context here, calling "sentinel" basically ensures engines
 * will give server owners better context on why and when they get blocked, so 
 * they can act accordingly.
 * 
 * Call it from your custom engines with context.sentinel(response, name) right
 * after every doFetch in your engine.
 */
export const sentinel = (
  response: { ok: boolean; status: number },
  engine: string,
): void => {
  if (response.ok) return;
  const status = evaluateThreat(response.status);
  throw new SentinelBreach(
    status,
    `${engine} upstream returned HTTP ${response.status}`,
    { httpStatus: response.status, engine },
  );
};
