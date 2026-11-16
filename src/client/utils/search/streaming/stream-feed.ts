import type { ScoredResult } from "../../../../shared/search-types";
import type {
  StreamDone,
  StreamEnginePartial,
  StreamEngineResult,
  StreamEngineRetry,
  StreamImageQuery,
  StreamingTiming,
} from "../../../../shared/search-stream";
import type { SearchEventSource } from "./fetch-event-stream";

export interface FeedView {
  results: (results: ScoredResult[]) => void;
  timings: (rows: StreamingTiming[]) => void;
  settled: () => void;
  done: (data: StreamDone) => void;
  failed: (event: MessageEvent<string>) => void;
  imageQuery?: (data: StreamImageQuery) => void;
}

export interface FeedOptions {
  progressive: boolean;
  live: () => boolean;
}

const _upsert = (rows: StreamingTiming[], row: StreamingTiming): void => {
  const at = rows.findIndex((existing) =>
    existing.id && row.id ? existing.id === row.id : existing.name === row.name,
  );
  if (at >= 0) rows[at] = row;
  else rows.push(row);
};

const _emittingRow = (data: StreamEnginePartial): StreamingTiming => ({
  name: data.engine,
  id: data.id,
  time: 0,
  resultCount: data.emitted,
  emitting: { count: data.emitted, expected: data.expected },
});

export function feedSearchStream(
  source: SearchEventSource,
  { progressive, live }: FeedOptions,
  view: FeedView,
): void {
  const rows: StreamingTiming[] = [];
  let latest: ScoredResult[] | null = null;
  let shown = progressive;

  const reveal = (): void => {
    if (shown) return;
    shown = true;
    if (latest) view.results(latest);
    view.timings(rows);
  };

  const publish = (results: ScoredResult[]): void => {
    latest = results;
    if (!shown) return;
    view.results(results);
    view.timings(rows);
  };

  source.addEventListener("engine-partial", (e) => {
    if (!live()) return;
    const data = JSON.parse(e.data) as StreamEnginePartial;
    _upsert(rows, _emittingRow(data));
    publish(data.results);
  });

  source.addEventListener("engine-result", (e) => {
    if (!live()) return;
    const data = JSON.parse(e.data) as StreamEngineResult;
    _upsert(rows, data.timing);
    publish(data.results);
  });

  source.addEventListener("engine-retry", (e) => {
    if (!live()) return;
    const data = JSON.parse(e.data) as StreamEngineRetry;
    _upsert(rows, { ...data.timing, resultCount: -1 });
    if (shown) view.timings(rows);
  });

  source.addEventListener("results-settled", () => {
    if (!live()) return;
    reveal();
    view.settled();
  });

  source.addEventListener("image-query", (e) => {
    if (!live()) return;
    view.imageQuery?.(JSON.parse(e.data) as StreamImageQuery);
  });

  source.addEventListener("done", (e) => {
    if (!live()) return;
    reveal();
    view.done(JSON.parse(e.data) as StreamDone);
  });

  source.addEventListener("error", (e) => view.failed(e));
}
