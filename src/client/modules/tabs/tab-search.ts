import { state } from "../../state";
import { setActiveTab } from "../../utils/navigation";
import { fetchSlotPanels } from "../../utils/search-utils";
import {
  clearSlotPanels,
  renderSidebar,
  buildResultContext,
} from "../renderer/render";
import { closeMediaPreview, destroyMediaObserver } from "../media/media";
import { hideAcDropdown } from "../../utils/autocomplete";
import { skeletonResults } from "../../animations/skeleton";
import { buildPaginationHtml } from "../../utils/pagination";
import { renderTemplate } from "../../utils/template";
import { SlotPanelPosition, type ScoredResult, type SearchResponse } from "../../types";
import { performStreamingSearch, abortStreamingSearch } from "../../utils/streaming-search";

let _streamingConfig: { enabled: boolean } | null = null;

const _fetchStreamingConfig = async (): Promise<boolean> => {
  if (_streamingConfig) return _streamingConfig.enabled;
  try {
    const res = await fetch("/api/settings/streaming");
    if (res.ok) {
      _streamingConfig = (await res.json()) as { enabled: boolean };
      return _streamingConfig.enabled;
    }
  } catch {}
  return false;
};

if (typeof window !== "undefined") {
  window.addEventListener("extensions-saved", () => {
    _streamingConfig = null;
  });
}

export async function performTabSearch(
  query: string,
  tabId: string,
  page = 1,
): Promise<void> {
  if (!query.trim()) return;

  if (tabId.startsWith("engine:") && page === 1 && await _fetchStreamingConfig()) {
    const engineType = tabId.replace("engine:", "");
    abortStreamingSearch();
    return performStreamingSearch(query, engineType, (q) => void performTabSearch(q, tabId));
  }

  state.currentQuery = query;
  state.currentType = `tab:${tabId}`;
  state.currentPage = page;
  destroyMediaObserver();

  setActiveTab(`tab:${tabId}`);
  closeMediaPreview();
  hideAcDropdown(document.getElementById("ac-dropdown-home"));
  hideAcDropdown(document.getElementById("ac-dropdown-results"));

  const resultsInput = document.getElementById(
    "results-search-input",
  ) as HTMLInputElement | null;
  if (resultsInput) resultsInput.value = query;
  const resultsMeta = document.getElementById("results-meta");
  if (resultsMeta) resultsMeta.textContent = "Searching...";
  const resultsList = document.getElementById("results-list");
  if (resultsList) resultsList.innerHTML = skeletonResults();
  const pagination = document.getElementById("pagination");
  if (pagination) pagination.innerHTML = "";
  const sidebar = document.getElementById("results-sidebar");
  if (sidebar) sidebar.innerHTML = "";
  const glanceEl = document.getElementById("at-a-glance");
  if (glanceEl) glanceEl.innerHTML = "";
  clearSlotPanels();
  document.title = `${query} - degoog`;

  const layout = document.getElementById("results-layout");
  if (layout) layout.classList.remove("media-mode");

  const urlParams = new URLSearchParams({ q: query, type: `tab:${tabId}` });
  if (page > 1) urlParams.set("page", String(page));
  history.pushState(null, "", `/search?${urlParams.toString()}`);

  try {
    const params = new URLSearchParams({
      tab: tabId,
      q: query,
      page: String(page),
    });
    const res = await fetch(`/api/tab-search?${params.toString()}`);
    const data = (await res.json()) as {
      results: ScoredResult[];
      totalPages?: number;
      page?: number;
      engineTimings?: SearchResponse["engineTimings"];
      totalTime?: number;
    };

    state.currentResults = data.results || [];
    const timings = data.engineTimings ?? [];
    const totalTime = data.totalTime ?? 0;
    if (resultsMeta)
      resultsMeta.textContent =
        totalTime > 0
          ? `${data.results?.length ?? 0} results (${(totalTime / 1000).toFixed(2)}s)`
          : `${data.results?.length ?? 0} results`;

    state.currentData = {
      results: state.currentResults,
      atAGlance: null,
      query,
      totalTime,
      type: `tab:${tabId}`,
      engineTimings: timings,
      relatedSearches: [],
      knowledgePanel: null,
    } satisfies SearchResponse;
    renderSidebar(state.currentData, (q) => void performTabSearch(q, tabId));

    _renderTabResults(data.results || [], resultsList);

    if (data.totalPages && data.totalPages > 1 && pagination) {
      _renderTabPagination(pagination, data.totalPages, page, query, tabId);
    }

    const panels = await fetchSlotPanels(query);
    renderSidebar(state.currentData, (q) => void performTabSearch(q, tabId), {
      sidebarTopPanels: panels.filter((p) => p.position === SlotPanelPosition.KnowledgePanel),
    });
  } catch {
    if (resultsMeta) resultsMeta.textContent = "";
    if (resultsList)
      resultsList.innerHTML =
        '<div class="no-results">Search failed. Please try again.</div>';
  }
}

function _renderTabResults(
  results: ScoredResult[],
  container: HTMLElement | null,
): void {
  if (!container) return;
  if (results.length === 0) {
    container.innerHTML = '<div class="no-results">No results found.</div>';
    return;
  }

  container.innerHTML = results
    .map((r) => {
      const ctx = buildResultContext(r);
      ctx.link_target = "_blank";
      return renderTemplate("degoog-result", ctx) ?? "";
    })
    .join("");
}

function _renderTabPagination(
  container: HTMLElement,
  totalPages: number,
  activePage: number,
  query: string,
  tabId: string,
): void {
  container.innerHTML = `<div class="pagination">${buildPaginationHtml(totalPages, activePage)}</div>`;
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
