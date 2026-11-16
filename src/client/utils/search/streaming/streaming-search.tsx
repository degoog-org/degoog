import { clear, render } from "../../../../shared/ui/tribute/dom";
import { TransText } from "../../../../shared/ui/components/primitives/trans-text";
import { NoResults } from "../../../../shared/ui/components/feedback/no-results";
import { NoEnginesLink } from "../engine-stats/no-engines-link";
import { MAX_PAGE } from "../../../constants";
import { destroyMediaObserver, setupMediaObserver } from "../../../modules/media/media-scroll";
import {
  renderEngineStats,
  renderSidebar,
} from "../../../modules/renderer/sidebar/render-sidebar";
import { attachVideoPlayers, renderPagination } from "../../../modules/renderer/render";
import { streamImageGrid } from "../../../modules/renderer/media/render-media";
import { announceSettled, RESULTS_READY } from "../../../modules/renderer/media/result-ranking";
import { renderImgEngines } from "../../../modules/filters/image-filters";
import { clearSlotPanels } from "../../../modules/renderer/render-slots";
import { SkeletonImageGrid } from "../../../animations/skeleton/skeleton-image-grid";
import { SkeletonResults } from "../../../animations/skeleton/skeleton-results";
import { beginSearch, isCurrentSearch, state } from "../../../state";
import {
  isImageSearchType,
  type ScoredResult,
  type SearchResponse,
} from "../../../../shared/search-types";
import { getEngines } from "../engines";
import {
  abortGlancePanels,
  abortSlotFetch,
  currentKnowledgePanels,
  streamGlancePanels,
  streamSlotPanels,
} from "../search-utils";
import type { SearchEventSource } from "./fetch-event-stream";
import {
  beginImageQuery,
  currentSearchImage,
  imageQueryError,
  noteImageQuery,
} from "../../../modules/search-image/search-image";
import { declaredPages, setResultsMeta } from "../search-helpers";
import { fetchStreamingConfig, infiniteScrollOn, panelsMaxWaitMs } from "./streaming-config";
import {
  armInfinite,
  teardownInfinite,
} from "../../../modules/renderer/infinite-scroll/infinite-scroll";
import { getBase } from "../../net/base-url";
import {
  loadSidebarSuggestions,
  prepareResultsUi,
  pushSearchHistory,
  searchFailureMessage,
  showSearchFailure,
} from "../actions/search-actions-render";
import { staysHere } from "../../dom/plain-click";
import {
  dropEnginePanels,
  updateEngineTimings,
  updateResults,
} from "./streaming-search-dom";
import { feedSearchStream, type StreamDone, type StreamingTiming } from "./stream-feed";
import { openSearchStream, streamsProgressively } from "./stream-request";
import {
  abortActiveStream,
  claimStream,
  isActiveStream,
  releaseStream,
} from "./active-stream";

const t = window.scopedT("themes/degoog");

type Navigate = (q: string) => void;

interface StreamPlan {
  seq: number;
  query: string;
  type: string;
  page: number;
  progressive: boolean;
  navigation: boolean;
  onComplete: Navigate;
  restorePage: number;
}

export interface StreamSearchOptions {
  page?: number;
  progressive?: boolean;
}

let _linkWatch: AbortController | null = null;

const _streamErrorStatus = (e: MessageEvent<string>): number | undefined => {
  try {
    const { status } = JSON.parse(e.data) as { status?: unknown };
    return typeof status === "number" ? status : undefined;
  } catch {
    return undefined;
  }
};

const _announceResults = (): void => {
  window.dispatchEvent(new CustomEvent(RESULTS_READY));
};

function _endLinkWatch(): void {
  _linkWatch?.abort();
  _linkWatch = null;
}

export function abortStreamingSearch(): void {
  abortActiveStream();
}

function _resetPaging(page: number): void {
  state.currentPage = page;
  state.lastPage = null;
  state.imagePage = 1;
  state.imageLastPage = MAX_PAGE;
  state.videoPage = 1;
  state.videoLastPage = MAX_PAGE;
}

export async function performStreamingSearch(
  query: string,
  type: string,
  onComplete: Navigate,
  isInitialLoad = false,
  restorePage = 1,
  opts: StreamSearchOptions = {},
): Promise<void> {
  abortStreamingSearch();
  const seq = beginSearch();
  const page = opts.page && opts.page > 1 ? opts.page : 1;

  state.currentQuery = query;
  state.currentBangQuery = "";
  state.currentType = type;
  _resetPaging(page);
  destroyMediaObserver();
  teardownInfinite();

  const engines = await getEngines();
  if (!isCurrentSearch(seq)) return;
  const progressive =
    opts.progressive ?? streamsProgressively(await fetchStreamingConfig(), type);
  if (!isCurrentSearch(seq)) return;

  prepareResultsUi(query, type);
  loadSidebarSuggestions(query, type, onComplete);
  pushSearchHistory(query, type, page, isInitialLoad);

  beginImageQuery();
  _streamInto(
    { seq, query, type, page, progressive, navigation: false, onComplete, restorePage },
    openSearchStream(query, engines, type, page),
  );
}

export async function streamResultsPage(page: number, onComplete: Navigate): Promise<void> {
  abortStreamingSearch();
  const seq = beginSearch();
  const { currentQuery: query, currentType: type } = state;
  window.scrollTo({ top: 0, behavior: "auto" });
  teardownInfinite();

  const resultsList = document.getElementById("results-list");
  if (resultsList) {
    render(isImageSearchType(type) ? <SkeletonImageGrid /> : <SkeletonResults />, resultsList);
  }
  const pagination = document.getElementById("pagination");
  if (pagination) clear(pagination);
  abortGlancePanels();
  abortSlotFetch();
  clearSlotPanels();
  dropEnginePanels(document.getElementById("results-sidebar"), "final");
  setResultsMeta(t("search-templates.status.searching"));

  const engines = await getEngines();
  if (!isCurrentSearch(seq)) return;
  const progressive = streamsProgressively(await fetchStreamingConfig(), type);
  if (!isCurrentSearch(seq)) return;

  state.currentPage = page;
  pushSearchHistory(query, type, page, false);
  _streamInto(
    { seq, query, type, page, progressive, navigation: true, onComplete, restorePage: 1 },
    openSearchStream(query, engines, type, page),
  );
}

function _streamInto(plan: StreamPlan, source: SearchEventSource): void {
  const { seq, query, type, page, progressive, navigation, onComplete, restorePage } = plan;
  const isImageType = isImageSearchType(type);
  const resultsList = document.getElementById("results-list");
  const sidebar = document.getElementById("results-sidebar");

  let firstResult = true;
  let currentResults: ScoredResult[] = [];
  const renderedUrls = new Set<string>();

  _endLinkWatch();
  claimStream(source, _endLinkWatch);
  const linkWatch = new AbortController();
  _linkWatch = linkWatch;

  const live = (): boolean => {
    if (isCurrentSearch(seq) && isActiveStream(source)) return true;
    releaseStream(source);
    return false;
  };

  resultsList?.addEventListener(
    "click",
    (ev) => {
      const anchor = (ev.target as Element).closest("a");
      if (!anchor || !isActiveStream(source)) return;
      if (staysHere(ev, anchor)) releaseStream(source);
    },
    { signal: linkWatch.signal },
  );

  let panelsStarted = false;
  let panelsWaitedOut = false;
  const startPanels = (): void => {
    if (panelsStarted || isImageType) return;
    panelsStarted = true;
    if (!navigation || page === 1) void streamGlancePanels(query, currentResults);
    void streamSlotPanels(query, currentResults);
  };

  const maxWait = panelsMaxWaitMs();
  if (progressive && maxWait > 0 && !isImageType) {
    window.setTimeout(() => {
      if (panelsStarted || !isActiveStream(source) || !live()) return;
      panelsWaitedOut = true;
      if (currentResults.length > 0) startPanels();
    }, maxWait);
  }

  const showResults = (results: ScoredResult[]): void => {
    if (isImageType) {
      if (results.length > 0) {
        if (firstResult && resultsList) {
          render(
            <>
              <div class="image-grid"></div>
              <div class="media-scroll-sentinel"></div>
            </>,
            resultsList,
          );
        }
        firstResult = false;
        currentResults = resultsList ? streamImageGrid(results, resultsList) : results;
        state.currentResults = currentResults;
      }
    } else {
      currentResults = results;
      state.currentResults = currentResults;
      if (firstResult) {
        firstResult = false;
        if (resultsList) clear(resultsList);
      }
      updateResults(resultsList, currentResults, renderedUrls);
      if (resultsList) attachVideoPlayers(resultsList);
    }

    setResultsMeta(
      t("search-templates.status.streaming", { count: String(currentResults.length) }),
    );
    if (panelsWaitedOut && currentResults.length > 0) startPanels();
    if (results.length > 0) _announceResults();
  };

  const showTimings = (rows: StreamingTiming[]): void => {
    if (isImageType) renderImgEngines(rows);
    else updateEngineTimings(sidebar, rows);
  };

  const finish = (data: StreamDone): void => {
    releaseStream(source);
    if (currentSearchImage()) noteImageQuery(query, data.imageQuery, data.imageQueryError);

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
    state.currentPage = page;
    state.lastPage = declaredPages(data.totalPages);

    setResultsMeta(
      navigation
        ? t("search-templates.status.page", {
            count: String(currentResults.length),
            page: String(page),
          })
        : t("search-templates.status.done", {
            count: String(currentResults.length),
            time: (data.totalTime / 1000).toFixed(2),
          }),
    );

    if (isImageType) {
      renderImgEngines(data.engineTimings);
      if (sidebar) clear(sidebar);
      if (currentResults.length > 0) setupMediaObserver("images");
    } else if (navigation) {
      startPanels();
      renderEngineStats(data.engineTimings, onComplete);
      dropEnginePanels(sidebar, "live");
    } else {
      updateEngineTimings(sidebar, data.engineTimings);
      startPanels();
      renderSidebar(searchData, onComplete, {
        sidebarTopPanels: currentKnowledgePanels(),
      });
    }

    if (currentResults.length === 0 && resultsList) {
      const body =
        imageQueryError() ??
        (data.engineTimings.length === 0 ? (
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
        ));
      render(<NoResults>{body}</NoResults>, resultsList);
    }

    if (resultsList) attachVideoPlayers(resultsList);
    if (!isImageType) {
      if (infiniteScrollOn()) {
        const paginationBox = document.getElementById("pagination");
        if (paginationBox) clear(paginationBox);
        armInfinite(type, restorePage);
      } else {
        renderPagination(state.lastPage, state.currentPage, currentResults.length > 0);
      }
    }
    _announceResults();
    announceSettled(seq);
  };

  feedSearchStream(source, { progressive, live }, {
    results: showResults,
    timings: showTimings,
    settled: () => startPanels(),
    imageQuery: (data) => noteImageQuery(query, data.query, data.error),
    done: finish,
    failed: (e) => {
      if (!isActiveStream(source) || !live()) {
        source.close();
        return;
      }
      console.error("[streaming-search] stream error", e);
      releaseStream(source);
      announceSettled(seq);
      showSearchFailure(searchFailureMessage(_streamErrorStatus(e)));
    },
  });
}
