import {
  skeletonGlance,
  skeletonImageGrid,
  skeletonResults,
  skeletonSidebar,
  skeletonVideoGrid,
} from "../animations/skeleton";
import { MAX_PAGE } from "../constants";
import {
  closeMediaPreview,
  destroyMediaObserver,
} from "../modules/media/media";
import {
  clearSlotPanels,
  renderPagination,
  renderResults,
  renderSidebar,
} from "../modules/renderer/render";
import { renderMediaEngineBar } from "../modules/renderer/render-media";
import { state } from "../state";
import {
  EngineTiming,
  ScoredResult,
  SearchResponse,
  SlotPanelPosition,
} from "../types";
import { hideAcDropdown } from "./autocomplete";
import { getEngines } from "./engines";
import { setActiveTab } from "./navigation";
import {
  abortGlancePanels,
  abortSlotPanels,
  fetchGlancePanels,
  fetchSlotPanels,
} from "./search-utils";
import { buildSearchUrl } from "./url";
import { appendSearchAuthParams } from "./request";
import {
  updateEngineTimings,
  updateResults,
} from "./search/streaming-search-dom";

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
  relatedSearches: string[];
}

let _activeSource: EventSource | null = null;

export function abortStreamingSearch(): void {
  if (_activeSource) {
    _activeSource.close();
    _activeSource = null;
  }
}

export async function performStreamingSearch(
  query: string,
  type: string,
  onComplete: (q: string) => void,
  isInitialLoad = false,
): Promise<void> {
  abortStreamingSearch();

  state.currentQuery = query;
  state.currentType = type;
  state.currentPage = 1;
  state.lastPage = MAX_PAGE;
  state.imagePage = 1;
  state.imageLastPage = MAX_PAGE;
  state.videoPage = 1;
  state.videoLastPage = MAX_PAGE;
  destroyMediaObserver();

  const engines = await getEngines();
  const url = buildSearchUrl(query, engines, type, 1);
  const streamUrl = appendSearchAuthParams(
    url.replace("/api/search?", "/api/search/stream?"),
  );

  setActiveTab(type);
  closeMediaPreview();
  hideAcDropdown(document.getElementById("ac-dropdown-home"));
  hideAcDropdown(document.getElementById("ac-dropdown-results"));
  const resultsInput = document.getElementById(
    "results-search-input",
  ) as HTMLInputElement | null;
  if (resultsInput) {
    resultsInput.value = query;
    resultsInput.defaultValue = query;
  }
  const isMediaType = type === "images" || type === "videos";
  const layout = document.getElementById("results-layout");
  if (isMediaType) {
    layout?.classList.add("media-mode");
  } else {
    layout?.classList.remove("media-mode");
  }
  const resultsMeta = document.getElementById("results-meta");
  if (resultsMeta) resultsMeta.textContent = "Searching...";
  const resultsList = document.getElementById("results-list");
  if (resultsList) {
    if (type === "images") {
      resultsList.innerHTML = skeletonImageGrid();
    } else if (type === "videos") {
      resultsList.innerHTML = skeletonVideoGrid();
    } else {
      resultsList.innerHTML = skeletonResults();
    }
  }
  const pagination = document.getElementById("pagination");
  if (pagination) pagination.innerHTML = "";
  const sidebar = document.getElementById("results-sidebar");
  if (sidebar) sidebar.innerHTML = isMediaType ? "" : skeletonSidebar();
  clearSlotPanels();
  if (isMediaType) {
    abortGlancePanels();
    abortSlotPanels();
  }
  const glanceEl = document.getElementById("at-a-glance");
  if (glanceEl) glanceEl.innerHTML = type === "web" ? skeletonGlance() : "";
  document.title = `${query} - degoog`;

  const urlParams = new URLSearchParams({ q: query });
  if (type !== "web") urlParams.set("type", type);
  const historyState = { degoog: true, query, type, page: 1 };
  const searchUrl = `/search?${urlParams.toString()}`;
  if (isInitialLoad) {
    history.replaceState(historyState, "", searchUrl);
  } else {
    history.pushState(historyState, "", searchUrl);
  }

  const engineTimings: EngineTiming[] = [];
  let firstResult = true;
  let currentResults: ScoredResult[] = [];
  const renderedUrls = new Set<string>();

  const source = new EventSource(streamUrl);
  _activeSource = source;

  source.addEventListener("engine-result", (e) => {
    const data = JSON.parse(e.data) as StreamEngineResult;

    const existingIdx = engineTimings.findIndex((t) => t.name === data.engine);
    if (existingIdx >= 0) {
      engineTimings[existingIdx] = data.timing;
    } else {
      engineTimings.push(data.timing);
    }

    currentResults = data.results;
    state.currentResults = currentResults;

    if (firstResult) {
      firstResult = false;
      if (resultsList) resultsList.innerHTML = "";
    }

    if (isMediaType) {
      renderResults(currentResults);
    } else {
      updateResults(resultsList, currentResults, renderedUrls);
    }

    if (resultsMeta) {
      resultsMeta.textContent = `About ${currentResults.length} results (streaming...)`;
    }

    if (isMediaType) {
      renderMediaEngineBar(engineTimings);
    } else {
      updateEngineTimings(sidebar, engineTimings);
    }
  });

  source.addEventListener("engine-retry", (e) => {
    const data = JSON.parse(e.data) as StreamEngineRetry;
    const existingIdx = engineTimings.findIndex((t) => t.name === data.engine);
    if (existingIdx >= 0) {
      engineTimings[existingIdx] = { ...data.timing, resultCount: -1 };
    } else {
      engineTimings.push({ ...data.timing, resultCount: -1 });
    }
    updateEngineTimings(sidebar, engineTimings);
  });

  source.addEventListener("done", (e) => {
    const data = JSON.parse(e.data) as StreamDone;
    source.close();
    _activeSource = null;

    const searchData: SearchResponse = {
      results: currentResults,
      query,
      totalTime: data.totalTime,
      type,
      engineTimings: data.engineTimings,
      relatedSearches: data.relatedSearches,
    };

    state.currentData = searchData;

    if (resultsMeta) {
      resultsMeta.textContent = `About ${currentResults.length} results (${(data.totalTime / 1000).toFixed(2)} seconds)`;
    }

    if (isMediaType) {
      renderMediaEngineBar(data.engineTimings);
      if (sidebar) sidebar.innerHTML = "";
    } else if (type === "web") {
      void fetchGlancePanels(query, currentResults);
      void fetchSlotPanels(query, currentResults).then((panels) => {
        const kpPanels = panels.filter(
          (p) => p.position === SlotPanelPosition.KnowledgePanel,
        );
        renderSidebar(
          searchData,
          (q) => onComplete(q),
          kpPanels.length > 0 ? { sidebarTopPanels: kpPanels } : undefined,
        );
      });
    } else {
      renderSidebar(searchData, (q) => onComplete(q));
      if (glanceEl) glanceEl.innerHTML = "";
    }

    if (currentResults.length === 0 && resultsList) {
      resultsList.innerHTML = '<div class="no-results">No results found.</div>';
    }

    renderPagination(MAX_PAGE, state.currentPage);
  });

  source.addEventListener("error", () => {
    source.close();
    _activeSource = null;
    if (firstResult) {
      if (resultsMeta) resultsMeta.textContent = "";
      if (resultsList)
        resultsList.innerHTML =
          '<div class="no-results">Search failed. Please try again.</div>';
    }
  });
}
