import { state } from "../state";
import { MAX_PAGE } from "../constants";
import { setActiveTab } from "./navigation";
import { getEngines } from "./engines";
import { buildSearchUrl } from "./url";
import {
  destroyMediaObserver,
  closeMediaPreview,
} from "../modules/media/media";
import { renderAtAGlance } from "../modules/renderer/render-slots";
import {
  renderResults,
  renderPagination,
  renderSidebar,
  clearSlotPanels,
  buildResultContext,
} from "../modules/renderer/render";
import { hideAcDropdown } from "./autocomplete";
import { fetchGlancePanels, fetchSlotPanels } from "./search-utils";
import { skeletonResults, skeletonGlance, skeletonImageGrid, skeletonVideoGrid } from "../animations/skeleton";
import { renderMediaEngineBar } from "../modules/renderer/render-media";
import { renderTemplate } from "./template";
import type { SearchResponse, ScoredResult, EngineTiming } from "../types";

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
  knowledgePanel: { title: string; description: string; image?: string; url: string } | null;
  atAGlance: ScoredResult | null;
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
  const streamUrl = url.replace("/api/search?", "/api/search/stream?");

  setActiveTab(type);
  closeMediaPreview();
  hideAcDropdown(document.getElementById("ac-dropdown-home"));
  hideAcDropdown(document.getElementById("ac-dropdown-results"));
  const resultsInput = document.getElementById(
    "results-search-input",
  ) as HTMLInputElement | null;
  if (resultsInput) resultsInput.value = query;
  const isMediaType = type === "images" || type === "videos";
  const layout = document.getElementById("results-layout");
  if (isMediaType) {
    layout?.classList.add("media-mode");
  } else {
    layout?.classList.remove("media-mode");
  }
  const resultsMeta = document.getElementById("results-meta");
  if (resultsMeta) resultsMeta.textContent = "Searching...";
  const glanceEl = document.getElementById("at-a-glance");
  if (glanceEl) glanceEl.innerHTML = type === "web" ? skeletonGlance() : "";
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
  if (sidebar) sidebar.innerHTML = "";
  clearSlotPanels();
  document.title = `${query} - degoog`;

  const urlParams = new URLSearchParams({ q: query });
  if (type !== "web") urlParams.set("type", type);
  history.pushState(null, "", `/search?${urlParams.toString()}`);

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
      _updateResults(resultsList, currentResults, renderedUrls);
    }

    if (type === "web" && currentResults.length > 0 && currentResults[0].snippet) {
      renderAtAGlance(currentResults[0]);
    }

    if (resultsMeta) {
      resultsMeta.textContent = `About ${currentResults.length} results (streaming...)`;
    }

    if (isMediaType) {
      renderMediaEngineBar(engineTimings);
    } else {
      _updateEngineTimings(sidebar, engineTimings);
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
    _updateEngineTimings(sidebar, engineTimings);
  });

  source.addEventListener("done", (e) => {
    const data = JSON.parse(e.data) as StreamDone;
    source.close();
    _activeSource = null;

    const searchData: SearchResponse = {
      results: currentResults,
      atAGlance:
        currentResults.length > 0 && currentResults[0].snippet
          ? currentResults[0]
          : null,
      query,
      totalTime: data.totalTime,
      type,
      engineTimings: data.engineTimings,
      relatedSearches: data.relatedSearches,
      knowledgePanel: data.knowledgePanel,
    };

    state.currentData = searchData;

    if (resultsMeta) {
      resultsMeta.textContent = `About ${currentResults.length} results (${(data.totalTime / 1000).toFixed(2)} seconds)`;
    }

    if (isMediaType) {
      renderMediaEngineBar(data.engineTimings);
      if (sidebar) sidebar.innerHTML = "";
    } else {
      renderSidebar(searchData, (q) => onComplete(q));
      if (type === "web") {
        void fetchGlancePanels(query, currentResults, data.atAGlance);
        void fetchSlotPanels(query);
      } else {
        if (glanceEl) glanceEl.innerHTML = "";
      }
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

function _renderResultEl(r: ScoredResult): HTMLElement | null {
  const html = renderTemplate("degoog-result", buildResultContext(r)) ?? "";
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const el = wrapper.firstElementChild as HTMLElement | null;
  if (!el) return null;
  el.dataset.resultUrl = r.url;
  return el;
}

function _updateResults(
  container: HTMLElement | null,
  results: ScoredResult[],
  renderedUrls: Set<string>,
): void {
  if (!container) return;

  const existingEls = new Map<string, HTMLElement>();
  container.querySelectorAll<HTMLElement>("[data-result-url]").forEach((el) => {
    const url = el.dataset.resultUrl;
    if (url) existingEls.set(url, el);
  });

  const resultMap = new Map(results.map((r) => [r.url, r]));

  for (const r of results) {
    const existing = existingEls.get(r.url);
    if (existing) {
      const oldSources = existing.querySelector(".result-engines")?.textContent?.trim() ?? "";
      const newSources = r.sources.join(" ");
      const oldSnippet = existing.querySelector(".result-snippet")?.textContent?.trim() ?? "";
      if (oldSources !== newSources || oldSnippet !== r.snippet.trim()) {
        const updated = _renderResultEl(r);
        if (updated) {
          container.replaceChild(updated, existing);
          existingEls.set(r.url, updated);
        }
      }
    } else {
      renderedUrls.add(r.url);
      const el = _renderResultEl(r);
      if (!el) continue;
      el.classList.add("result-stream-in");
      container.appendChild(el);
      existingEls.set(r.url, el);
    }
  }

  const children = Array.from(container.children) as HTMLElement[];
  const sorted = [...children].sort((a, b) => {
    const sa = resultMap.get(a.dataset.resultUrl ?? "")?.score ?? 0;
    const sb = resultMap.get(b.dataset.resultUrl ?? "")?.score ?? 0;
    return sb - sa;
  });

  let needsReorder = false;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] !== children[i]) {
      needsReorder = true;
      break;
    }
  }

  if (needsReorder) {
    for (const el of sorted) {
      container.appendChild(el);
    }
  }
}

function _updateEngineTimings(
  sidebar: HTMLElement | null,
  timings: EngineTiming[],
): void {
  if (!sidebar || !state.displayEnginePerformance) return;

  let panel = sidebar.querySelector<HTMLElement>(".streaming-engine-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "sidebar-panel sidebar-accordion streaming-engine-panel open";
    panel.innerHTML = `
      <button class="sidebar-accordion-toggle" type="button">
        <span>Engine Performance</span>
        <svg class="accordion-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="sidebar-accordion-body"></div>`;
    panel.querySelector(".sidebar-accordion-toggle")?.addEventListener("click", () => {
      panel!.classList.toggle("open");
    });
    sidebar.appendChild(panel);
  }

  const body = panel.querySelector<HTMLElement>(".sidebar-accordion-body");
  if (!body) return;

  let html = "";
  for (const et of timings) {
    const isRetrying = et.resultCount === -1;
    const statusClass = isRetrying ? " engine-retrying" : et.resultCount === 0 ? " engine-failed" : "";
    const meta = isRetrying
      ? `retrying... · ${et.time}ms`
      : `${et.resultCount} results · ${et.time}ms`;
    html += `
      <div class="engine-stat-row${statusClass}">
        <div class="engine-stat-info">
          <div class="engine-stat-label">${et.name}</div>
          <div class="engine-stat-meta">${meta}</div>
        </div>
      </div>`;
  }
  body.innerHTML = html;
}
