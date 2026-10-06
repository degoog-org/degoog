import { clear, render } from "../../../../shared/ui/tribute/dom";
import { TransText } from "../../../../shared/ui/components/primitives/trans-text";
import { NoResults } from "../../../../shared/ui/components/feedback/no-results";
import { NoEnginesLink } from "../engine-stats/no-engines-link";
import { MAX_PAGE } from "../../../constants";
import { destroyMediaObserver, setupMediaObserver } from "../../../modules/media/media-scroll";
import { renderSidebar } from "../../../modules/renderer/sidebar/render-sidebar";
import { attachVideoPlayers, renderPagination } from "../../../modules/renderer/render";
import { renderImageGrid } from "../../../modules/renderer/media/render-media";
import { RESULTS_READY } from "../../../modules/renderer/media/result-ranking";
import { renderImgEngines } from "../../../modules/filters/image-filters";
import { beginSearch, isCurrentSearch, state } from "../../../state";
import {
  type EngineTiming,
  isImageSearchType,
  type ScoredResult,
  type SearchResponse,
  SlotPanelPosition,
} from "../../../../shared/search-types";
import { getEngines } from "../engines";
import { fetchGlancePanels, fetchSlotPanels } from "../search-utils";
import { buildSearchUrl } from "../../net/url";
import { appendSearchAuthParams } from "../../net/request";
import { declaredPages } from "../search-helpers";
import { infiniteScrollOn } from "./streaming-config";
import {
  armInfinite,
  teardownInfinite,
} from "../../../modules/renderer/infinite-scroll/infinite-scroll";
import { getBase } from "../../net/base-url";
import {
  loadSidebarSuggestions,
  prepareResultsUi,
  pushSearchHistory,
} from "../actions/search-actions-render";
import { staysHere } from "../../dom/plain-click";
import {
  updateEngineTimings,
  updateResults,
} from "./streaming-search-dom";

const t = window.scopedT("themes/degoog");

interface StreamEngineResult {
  engine: string;
  timing: EngineTiming;
  results: ScoredResult[];
  retry: boolean;
  attempt: number;
}

interface StreamEngineRetry {
  engine: string;
  attempt: number;
  maxRetries: number;
  timing: EngineTiming;
}

interface StreamDone {
  totalTime: number;
  engineTimings: EngineTiming[];
  indexedUrls?: string[];
  relatedSearches: string[];
  totalPages?: number;
}

let _activeSource: EventSource | null = null;
let _linkWatch: AbortController | null = null;

const _announceResults = (): void => {
  window.dispatchEvent(new CustomEvent(RESULTS_READY));
};

const dropStream = (source: EventSource): void => {
  source.close();
  if (_activeSource !== source) return;
  _activeSource = null;
  _linkWatch?.abort();
  _linkWatch = null;
};

export function abortStreamingSearch(): void {
  if (_activeSource) dropStream(_activeSource);
}

export async function performStreamingSearch(
  query: string,
  type: string,
  onComplete: (q: string) => void,
  isInitialLoad = false,
  restorePage = 1,
): Promise<void> {
  abortStreamingSearch();
  const seq = beginSearch();

  state.currentQuery = query;
  state.currentBangQuery = "";
  state.currentType = type;
  state.currentPage = 1;
  state.lastPage = null;
  state.imagePage = 1;
  state.imageLastPage = MAX_PAGE;
  state.videoPage = 1;
  state.videoLastPage = MAX_PAGE;
  destroyMediaObserver();
  teardownInfinite();

  const engines = await getEngines();
  if (!isCurrentSearch(seq)) return;
  const url = buildSearchUrl(query, engines, type, 1);
  const streamUrl = appendSearchAuthParams(
    url.replace("/api/search?", "/api/search/stream?"),
  );

  prepareResultsUi(query, type);
  loadSidebarSuggestions(query, type, onComplete);
  pushSearchHistory(query, type, 1, isInitialLoad);

  const isImageType = isImageSearchType(type);
  const resultsMeta = document.getElementById("results-meta");
  const resultsList = document.getElementById("results-list");
  const sidebar = document.getElementById("results-sidebar");

  const engineTimings: EngineTiming[] = [];
  let firstResult = true;
  let currentResults: ScoredResult[] = [];
  const renderedUrls = new Set<string>();

  const source = new EventSource(streamUrl);
  _activeSource = source;
  _linkWatch = new AbortController();

  const live = (): boolean => {
    if (isCurrentSearch(seq)) return true;
    dropStream(source);
    return false;
  };

  resultsList?.addEventListener(
    "click",
    (ev) => {
      const anchor = (ev.target as Element).closest("a");
      if (!anchor || _activeSource !== source) return;
      if (staysHere(ev, anchor)) dropStream(source);
    },
    { signal: _linkWatch.signal },
  );

  source.addEventListener("engine-result", (e) => {
    if (!live()) return;
    const data = JSON.parse(e.data) as StreamEngineResult;

    const existingIdx = engineTimings.findIndex(
      (timing) => timing.name === data.engine,
    );
    if (existingIdx >= 0) {
      engineTimings[existingIdx] = data.timing;
    } else {
      engineTimings.push(data.timing);
    }

    if (isImageType) {
      if (firstResult) {
        firstResult = false;
        if (resultsList) {
          render(
            <>
              <div class="image-grid"></div>
              <div class="media-scroll-sentinel"></div>
            </>,
            resultsList,
          );
        }
      }
      currentResults = data.results;
      state.currentResults = currentResults;
      if (resultsList) renderImageGrid(currentResults, resultsList);
    } else {
      currentResults = data.results;
      state.currentResults = currentResults;
      if (firstResult) {
        firstResult = false;
        if (resultsList) clear(resultsList);
      }
      updateResults(resultsList, currentResults, renderedUrls);
      if (resultsList) attachVideoPlayers(resultsList);
    }

    if (resultsMeta) {
      resultsMeta.textContent = t("search-templates.status.streaming", {
        count: String(currentResults.length),
      });
    }

    if (isImageType) {
      renderImgEngines(engineTimings);
    } else {
      updateEngineTimings(sidebar, engineTimings);
    }
    _announceResults();
  });

  source.addEventListener("engine-retry", (e) => {
    if (!live()) return;
    const data = JSON.parse(e.data) as StreamEngineRetry;
    const existingIdx = engineTimings.findIndex(
      (timing) => timing.name === data.engine,
    );
    if (existingIdx >= 0) {
      engineTimings[existingIdx] = { ...data.timing, resultCount: -1 };
    } else {
      engineTimings.push({ ...data.timing, resultCount: -1 });
    }
    if (isImageType) {
      renderImgEngines(engineTimings);
    } else {
      updateEngineTimings(sidebar, engineTimings);
    }
  });

  source.addEventListener("done", (e) => {
    if (!live()) return;
    const data = JSON.parse(e.data) as StreamDone;
    dropStream(source);

    if (!isImageType && data.indexedUrls && data.indexedUrls.length > 0) {
      const indexedSet = new Set(data.indexedUrls);
      for (const r of currentResults) {
        if (r.idx !== "recalled" && indexedSet.has(r.url)) r.idx = "indexing";
      }
      updateResults(resultsList, currentResults, renderedUrls);
    }

    const searchData: SearchResponse = {
      results: currentResults,
      query,
      totalTime: data.totalTime,
      type,
      engineTimings: data.engineTimings,
      relatedSearches: data.relatedSearches,
      totalPages: data.totalPages,
    };

    state.currentData = searchData;
    state.lastPage = declaredPages(data.totalPages);

    if (resultsMeta) {
      resultsMeta.textContent = t("search-templates.status.done", {
        count: String(currentResults.length),
        time: (data.totalTime / 1000).toFixed(2),
      });
    }

    if (isImageType) {
      renderImgEngines(data.engineTimings);
      if (sidebar) clear(sidebar);
      if (currentResults.length > 0) setupMediaObserver("images");
    } else {
      updateEngineTimings(sidebar, data.engineTimings);
      void fetchGlancePanels(query, currentResults);
      void fetchSlotPanels(query, currentResults).then((panels) => {
        if (!isCurrentSearch(seq)) return;
        const kpPanels = panels.filter(
          (p) => p.position === SlotPanelPosition.KnowledgePanel,
        );
        renderSidebar(
          searchData,
          (q) => onComplete(q),
          kpPanels.length > 0 ? { sidebarTopPanels: kpPanels } : undefined,
        );
      });
    }

    if (currentResults.length === 0 && resultsList) {
      const body =
        engineTimings.length === 0 ? (
          <TransText
            text={t("search-templates.no-engines", { store: "{store}" })}
            slots={{
              store: (
                <NoEnginesLink
                  href={`${getBase()}/settings/store`}
                  label={t("search-templates.no-engines-store")}
                />
              ),
            }}
          />
        ) : (
          t("search-templates.no-results")
        );
      render(<NoResults>{body}</NoResults>, resultsList);
    }

    if (resultsList) attachVideoPlayers(resultsList);
    if (!isImageType) {
      if (infiniteScrollOn()) {
        const paginationBox = document.getElementById("pagination");
        if (paginationBox) clear(paginationBox);
        armInfinite(type, restorePage);
      } else {
        renderPagination(
          state.lastPage,
          state.currentPage,
          currentResults.length > 0,
        );
      }
    }
    _announceResults();
  });

  source.addEventListener("error", (e) => {
    if (_activeSource !== source || !live()) {
      source.close();
      return;
    }
    console.error("[streaming-search] stream error", e);
    dropStream(source);
    if (resultsMeta) resultsMeta.textContent = "";
    if (resultsList)
      render(
        <NoResults>{t("search-templates.search-failed")}</NoResults>,
        resultsList,
      );
  });
}
