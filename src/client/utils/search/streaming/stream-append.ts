import { isCurrentSearch, state } from "../../../state";
import type { EngineTiming, ScoredResult } from "../../../../shared/search-types";
import { attachVideoPlayers } from "../../../modules/renderer/render";
import { RESULTS_READY } from "../../../modules/renderer/media/result-ranking";
import { mergeEngineTimings } from "../engine-stats/engine-stats";
import { getEngines } from "../engines";
import { fetchStreamingConfig } from "./streaming-config";
import { dropEnginePanels, updateEngineTimings, updatePageRows } from "./streaming-search-dom";
import { feedSearchStream } from "./stream-feed";
import type { StreamingTiming } from "../../../../shared/search-stream";
import { openSearchStream, streamsProgressively } from "./stream-request";
import { claimStream, isActiveStream, releaseStream } from "./active-stream";
import { shownKeys, unseenRows } from "./page-rows";

export interface AppendedPage {
  results: ScoredResult[];
  fetched: number;
  totalPages?: number;
  engineTimings: EngineTiming[];
}

export async function streamAppendPage(
  page: number,
  startIndex: number,
  onFirstRows: () => void,
): Promise<AppendedPage | null> {
  const seq = state.searchSeq;
  const { currentQuery: query, currentType: type } = state;
  const engines = await getEngines();
  const progressive = streamsProgressively(await fetchStreamingConfig(), type);
  if (!isCurrentSearch(seq)) return null;

  const container = document.getElementById("results-list");
  const sidebar = document.getElementById("results-sidebar");
  const shown = shownKeys(state.currentResults);
  const baseTimings = state.currentData?.engineTimings ?? [];
  let rows: ScoredResult[] = [];
  let fetched = 0;
  let firstRows = true;
  let liveStats = false;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: AppendedPage | null): void => {
      if (settled) return;
      settled = true;
      if (liveStats) dropEnginePanels(sidebar, "live");
      resolve(outcome);
    };

    const source = openSearchStream(query, engines, type, page);
    claimStream(source, () => finish(null));
    const live = (): boolean => {
      if (isCurrentSearch(seq) && isActiveStream(source)) return true;
      releaseStream(source);
      return false;
    };

    feedSearchStream(source, { progressive, live }, {
      results: (frame) => {
        fetched = frame.length;
        rows = unseenRows(frame, shown);
        updatePageRows(container, rows, page, startIndex);
        if (firstRows && rows.length > 0) {
          firstRows = false;
          onFirstRows();
        }
        if (container) attachVideoPlayers(container);
        if (rows.length > 0) window.dispatchEvent(new CustomEvent(RESULTS_READY));
      },
      timings: (liveRows: StreamingTiming[]) => {
        if (!liveStats) {
          liveStats = true;
          dropEnginePanels(sidebar, "final");
        }
        updateEngineTimings(
          sidebar,
          mergeEngineTimings(baseTimings, liveRows, page) as StreamingTiming[],
        );
      },
      settled: () => {},
      done: (data) => {
        const outcome = {
          results: rows,
          fetched,
          totalPages: data.totalPages,
          engineTimings: data.engineTimings,
        };
        finish(outcome);
        releaseStream(source);
      },
      failed: () => {
        const outcome = rows.length > 0 ? { results: rows, fetched, engineTimings: [] } : null;
        finish(outcome);
        releaseStream(source);
      },
    });
  });
}
