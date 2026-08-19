import type { EngineTiming, ScoredResult } from "../../types";

export type EngineTimingWithPage = EngineTiming & {
  failedPage?: number;
};

const _failed = (timing: EngineTiming): boolean =>
  !!timing.status && timing.status !== "ok";

export const mergeEngineTimings = (
  existing: EngineTimingWithPage[],
  incoming: EngineTiming[],
  page: number,
): EngineTimingWithPage[] => {
  const merged = new Map<string, EngineTimingWithPage>();
  existing.forEach((timing) => {
    merged.set(timing.name, { ...timing });
  });

  incoming.forEach((timing) => {
    const prev = merged.get(timing.name);
    const failed = _failed(timing);
    const recovered = prev?.failedPage === page && !failed;
    merged.set(timing.name, {
      ...prev,
      ...timing,
      time: (prev?.time ?? 0) + timing.time,
      resultCount: (prev?.resultCount ?? 0) + timing.resultCount,
      status: recovered ? "ok" : failed ? timing.status : prev?.status ?? timing.status,
      errorReason: recovered
        ? undefined
        : failed
          ? timing.errorReason
          : prev?.errorReason ?? timing.errorReason,
      httpStatus: recovered
        ? undefined
        : failed
          ? timing.httpStatus
          : prev?.httpStatus ?? timing.httpStatus,
      failedPage: recovered ? undefined : failed ? page : prev?.failedPage,
    });
  });

  return Array.from(merged.values());
};

export const mergeScoredResults = (
  existing: ScoredResult[],
  incoming: ScoredResult[],
): ScoredResult[] => {
  const merged = new Map<string, ScoredResult>();
  existing.forEach((result) => {
    merged.set(result.url, { ...result, sources: [...result.sources] });
  });

  incoming.forEach((result) => {
    const prev = merged.get(result.url);
    if (!prev) {
      merged.set(result.url, { ...result, sources: [...result.sources] });
      return;
    }
    merged.set(result.url, {
      ...prev,
      ...result,
      score: Math.max(prev.score, result.score),
      sources: Array.from(new Set([...prev.sources, ...result.sources])),
      snippet: result.snippet.length > prev.snippet.length ? result.snippet : prev.snippet,
    });
  });

  return Array.from(merged.values()).sort((a, b) => b.score - a.score);
};
