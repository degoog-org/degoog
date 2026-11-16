import type { EngineTiming, ScoredResult } from "./search-types";

export interface StreamingTiming extends EngineTiming {
  emitting?: { count: number; expected?: number };
}

export interface StreamDone {
  totalTime: number;
  engineTimings: EngineTiming[];
  indexedUrls?: string[];
  relatedSearches: string[];
  totalPages?: number;
  imageQuery?: string;
  imageQueryError?: string;
}

export interface StreamImageQuery {
  query: string | null;
  error: string | null;
}

export interface StreamEngineResult {
  engine: string;
  timing: EngineTiming;
  results: ScoredResult[];
  retry: boolean;
  attempt: number;
}

export interface StreamEnginePartial {
  engine: string;
  id?: string;
  emitted: number;
  expected?: number;
  results: ScoredResult[];
}

export interface StreamEngineRetry {
  engine: string;
  attempt: number;
  maxRetries: number;
  timing: EngineTiming;
}
