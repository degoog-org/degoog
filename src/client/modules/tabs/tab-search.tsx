import { teardownInfinite } from "../renderer/infinite-scroll/infinite-scroll";
import { clear, render } from "../../../shared/ui/tribute/dom";
import { NoResults } from "../../../shared/ui/components/feedback/no-results";
import { PaginationWrap } from "../../utils/pagination/pagination-wrap";
import { SkeletonImageGrid } from "../../animations/skeleton/skeleton-image-grid";
import { SkeletonResults } from "../../animations/skeleton/skeleton-results";
import { SkeletonSidebar } from "../../animations/skeleton/skeleton-sidebar";
import { beginSearch, isCurrentSearch, state } from "../../state";
import {
  isImageSearchType,
  type ScoredResult,
  type SearchResponse,
} from "../../../shared/search-types";
import { hideAcDropdown } from "../../utils/autocomplete/autocomplete";
import { setActiveTab, showAllTabs } from "../../utils/navigation/navigation";
import { fetchStreamingConfig } from "../../utils/search/streaming/streaming-config";
import { Pagination } from "../../utils/pagination/pagination";
import {
  currentKnowledgePanels,
  streamGlancePanels,
  streamSlotPanels,
} from "../../utils/search/search-utils";
import {
  abortStreamingSearch,
  performStreamingSearch,
} from "../../utils/search/streaming/streaming-search";
import { renderTemplate } from "../../utils/dom/template";
import {
  closeMediaPreview,
  MediaPreviewCloseMode,
  syncMediaPreviewPanel,
} from "../media/media";
import { destroyMediaObserver, setupMediaObserver } from "../media/media-scroll";
import { renderSidebar } from "../renderer/sidebar/render-sidebar";
import { clearSlotPanels } from "../renderer/render-slots";
import {
  buildResultContext,
  hydrateFavicons,
  renderResults,
} from "../renderer/render";
import { renderImgEngines } from "../filters/image-filters";
import { getBase } from "../../utils/net/base-url";
import { buildSearchBody, buildSearchParams } from "../../utils/net/url";
import { appendSearchAuthParams, searchAuthHeaders } from "../../utils/net/request";
import { getEngines } from "../../utils/search/engines";
import { MAX_PAGE } from "../../constants";

const t = window.scopedT("themes/degoog");

export async function performTabSearch(
  query: string,
  tabId: string,
  page = 1,
): Promise<void> {
  if (!query.trim()) return;
  destroyMediaObserver();
  teardownInfinite();
  const seq = beginSearch();

  const tabType = `tab:${tabId}`;
  const isImageType = isImageSearchType(tabType);

  void import("../filters/image-filters").then(({ syncImgFilters }) =>
    syncImgFilters(tabType),
  );

  const isInit = state.isInitialLoad;
  state.isInitialLoad = false;

  const engineType = tabId.startsWith("engine:")
    ? tabId.replace("engine:", "")
    : "";
  const streamingConfig = engineType ? await fetchStreamingConfig() : null;
  if (!isCurrentSearch(seq)) return;
  if (
    streamingConfig?.enabled &&
    page === 1 &&
    !state.postMethodEnabled &&
    !streamingConfig.disabledTypes.includes(engineType)
  ) {
    abortStreamingSearch();
    return performStreamingSearch(
      query,
      engineType,
      (q) => void performTabSearch(q, tabId),
      isInit,
    );
  }

  state.currentQuery = query;
  state.currentBangQuery = "";
  state.currentType = `tab:${tabId}`;
  state.currentPage = page;
  state.imagePage = page;
  state.imageLastPage = MAX_PAGE;
  state.videoPage = page;
  state.videoLastPage = MAX_PAGE;
  destroyMediaObserver();
  teardownInfinite();

  showAllTabs();
  setActiveTab(`tab:${tabId}`);
  closeMediaPreview(MediaPreviewCloseMode.Reset);
  hideAcDropdown(document.getElementById("ac-dropdown-home"));
  hideAcDropdown(document.getElementById("ac-dropdown-results"));

  const resultsInput = document.getElementById(
    "results-search-input",
  ) as HTMLInputElement | null;
  if (resultsInput) resultsInput.value = query;
  const resultsMeta = document.getElementById("results-meta");
  if (resultsMeta) resultsMeta.textContent = t("search-templates.status.searching");
  const resultsList = document.getElementById("results-list");
  if (resultsList) {
    render(
      isImageType ? <SkeletonImageGrid /> : <SkeletonResults />,
      resultsList,
    );
  }
  const pagination = document.getElementById("pagination");
  if (pagination) clear(pagination);
  const sidebar = document.getElementById("results-sidebar");
  if (sidebar) {
    if (isImageType) clear(sidebar);
    else render(<SkeletonSidebar />, sidebar);
  }
  const glanceEl = document.getElementById("at-a-glance");
  if (glanceEl) clear(glanceEl);
  clearSlotPanels();
  if (!isImageType) {
    void streamSlotPanels(query);
    void streamGlancePanels(query);
  }
  document.title = `${query} - degoog`;

  const layout = document.getElementById("results-layout");
  if (layout) {
    if (isImageType) layout.classList.add("media-mode");
    else layout.classList.remove("media-mode");
  }
  syncMediaPreviewPanel(isImageType);

  const urlParams = new URLSearchParams({ q: query, type: `tab:${tabId}` });
  if (page > 1) urlParams.set("page", String(page));
  const tabHistoryState = { degoog: true, query, type: `tab:${tabId}`, page };
  if (state.postMethodEnabled) {
    if (isInit) {
      history.replaceState(tabHistoryState, "", `${getBase()}/search`);
    } else {
      history.pushState(tabHistoryState, "", `${getBase()}/search`);
    }
  } else {
    const getUrl = `${getBase()}/search?${urlParams.toString()}`;
    if (isInit) {
      history.replaceState(tabHistoryState, "", getUrl);
    } else {
      history.pushState(tabHistoryState, "", getUrl);
    }
  }

  try {
    const engines = await getEngines();
    const res = state.postMethodEnabled
      ? await fetch(`${getBase()}/api/tab-search`, {
          method: "POST",
          body: JSON.stringify({
            ...buildSearchBody(query, engines, tabType, page),
            tab: tabId,
            page,
          }),
          headers: {
            "Content-Type": "application/json",
            ...searchAuthHeaders(),
          },
        })
      : await fetch(appendSearchAuthParams(_tabSearchUrl(query, engines, tabType, tabId, page)));
    const data = (await res.json()) as {
      results: ScoredResult[];
      totalPages?: number;
      page?: number;
      engineTimings?: SearchResponse["engineTimings"];
      totalTime?: number;
    };
    if (!isCurrentSearch(seq)) return;

    state.currentResults = data.results || [];
    const timings = data.engineTimings ?? [];
    const totalTime = data.totalTime ?? 0;
    if (resultsMeta)
      resultsMeta.textContent =
        totalTime > 0
          ? `${data.results?.length ?? 0} results (${(totalTime / 1000).toFixed(2)}s)`
          : `${data.results?.length ?? 0} results`;

    const currentData: SearchResponse = {
      results: state.currentResults,
      query,
      totalTime,
      type: `tab:${tabId}`,
      engineTimings: timings,
      relatedSearches: [],
    };
    state.currentData = currentData;

    if (isImageType) {
      renderImgEngines(timings);
      renderResults(data.results || []);
      setupMediaObserver("images");
      return;
    }

    _renderTabResults(data.results || [], resultsList);

    if (data.totalPages && data.totalPages > 1 && pagination && !isImageType) {
      _renderTabPagination(pagination, data.totalPages, page, query, tabId);
    }
  } catch (err) {
    console.error("[tab-search] search failed", err);
    if (!isCurrentSearch(seq)) return;
    if (resultsMeta) resultsMeta.textContent = "";
    if (resultsList)
      render(
        <NoResults>{t("search-templates.search-failed")}</NoResults>,
        resultsList,
      );
    return;
  }

  const currentData = state.currentData;
  if (!currentData || isImageType) return;

  void streamSlotPanels(query, state.currentResults);
  try {
    renderSidebar(currentData, (q) => void performTabSearch(q, tabId), {
      sidebarTopPanels: currentKnowledgePanels(),
    });
  } catch (err) {
    console.warn("[tab-search] sidebar render failed", err);
  }
}

const _tabSearchUrl = (
  query: string,
  engines: Record<string, boolean>,
  tabType: string,
  tabId: string,
  page: number,
): string => {
  const params = buildSearchParams(query, engines, tabType, page);
  params.delete("type");
  params.set("tab", tabId);
  params.set("page", String(page));
  return `${getBase()}/api/tab-search?${params.toString()}`;
};

function _renderTabResults(
  results: ScoredResult[],
  container: HTMLElement | null,
): void {
  if (!container) return;
  if (results.length === 0) {
    render(<NoResults>{t("search-templates.no-results")}</NoResults>, container);
    return;
  }

  container.innerHTML = results
    .map((r) => {
      const ctx = buildResultContext(r);
      ctx.link_target = "_blank";
      return renderTemplate("degoog-result", ctx) ?? "";
    })
    .join("");
  hydrateFavicons(container);
}

function _renderTabPagination(
  container: HTMLElement,
  totalPages: number,
  activePage: number,
  query: string,
  tabId: string,
): void {
  render(
    <PaginationWrap>
      <Pagination totalPages={totalPages} activePage={activePage} />
    </PaginationWrap>,
    container,
  );
  container.querySelectorAll<HTMLElement>("[data-page]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const pageNum = parseInt(el.dataset.page ?? "0", 10);
      if (pageNum >= 1 && pageNum <= totalPages) {
        void performTabSearch(query, tabId, pageNum);
      }
    });
  });
}
