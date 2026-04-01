import { state } from "../state";
import { MAX_PAGE, BUILTIN_SEARCH_TYPES } from "../constants";
import { setActiveTab } from "./navigation";
import { getEngines } from "./engines";
import { buildSearchUrl } from "./url";
import { buildPaginationHtml } from "./pagination";
import {
  destroyMediaObserver,
  closeMediaPreview,
} from "../modules/media/media";
import { renderAtAGlance } from "../modules/renderer/render-slots";
import {
  renderResults,
  renderSidebar,
  clearSlotPanels,
} from "../modules/renderer/render";
import { renderMediaEngineBar } from "../modules/renderer/render-media";
import { hideAcDropdown } from "./autocomplete";
import {
  setResultsMeta,
  runScriptsInContainer,
  getNaturalLanguageBangQuery,
} from "./search-helpers";
import {
  fetchGlancePanels,
  fetchSlotPanels,
  buildCommandGlanceHtml,
} from "./search-utils";
import { skeletonResults, skeletonGlance, skeletonImageGrid, skeletonVideoGrid } from "../animations/skeleton";
import { type Command, type SearchResponse, type ScoredResult } from "../types";
import { performStreamingSearch, abortStreamingSearch } from "./streaming-search";

let commandsCache: Command[] | null = null;
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

if (typeof window !== "undefined") {
  window.addEventListener("extensions-saved", () => {
    commandsCache = null;
  });
}

const _fetchCommands = async (): Promise<Command[]> => {
  if (commandsCache) return commandsCache;
  try {
    const res = await fetch("/api/commands", { cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as { commands?: Command[] };
      commandsCache = body.commands || [];
      return commandsCache;
    }
  } catch { }
  return [];
};

export async function performSearch(
  query: string,
  type?: string,
  page?: number,
): Promise<void> {
  const resolvedType = type || state.currentType || "web";
  if (!query.trim()) return;

  if (resolvedType.startsWith("tab:")) {
    const { performTabSearch } = await import("../modules/tabs/tab-search");
    return performTabSearch(query, resolvedType.slice(4), page);
  }

  const prefixMatch = query.trim().match(/^(\w+):(.+)$/);
  if (prefixMatch && !query.trim().startsWith("http")) {
    const prefix = prefixMatch[1].toLowerCase();
    const actualQuery = prefixMatch[2].trim();
    if (actualQuery) {
      if (prefix !== "web" && BUILTIN_SEARCH_TYPES.has(prefix)) {
        return performSearch(actualQuery, prefix, page);
      }
      const { getPluginTabIds } = await import("../modules/tabs/tabs");
      const knownTypes = await getPluginTabIds();
      if (knownTypes.has(prefix)) {
        const { performTabSearch } = await import("../modules/tabs/tab-search");
        return performTabSearch(actualQuery, `engine:${prefix}`, page);
      }
    }
  }

  if (query.trim().startsWith("!")) {
    state.currentQuery = query;
    return _performBangCommand(query, resolvedType, page || 1);
  }

  if ((!page || page === 1) && await _fetchStreamingConfig()) {
    abortStreamingSearch();
    return performStreamingSearch(query, resolvedType, (q) => void performSearch(q));
  }

  state.currentQuery = query;
  state.currentType = resolvedType;
  state.currentPage = 1;
  state.lastPage = MAX_PAGE;
  state.imagePage = 1;
  state.imageLastPage = MAX_PAGE;
  state.videoPage = 1;
  state.videoLastPage = MAX_PAGE;
  destroyMediaObserver();

  const engines = await getEngines();
  const url = buildSearchUrl(query, engines, resolvedType, 1);


  setActiveTab(resolvedType);
  closeMediaPreview();
  hideAcDropdown(document.getElementById("ac-dropdown-home"));
  hideAcDropdown(document.getElementById("ac-dropdown-results"));
  const resultsInput = document.getElementById(
    "results-search-input",
  ) as HTMLInputElement | null;
  if (resultsInput) resultsInput.value = query;
  const layout = document.getElementById("results-layout");
  if (resolvedType === "images" || resolvedType === "videos") {
    layout?.classList.add("media-mode");
  } else {
    layout?.classList.remove("media-mode");
  }
  const resultsMeta = document.getElementById("results-meta");
  if (resultsMeta) resultsMeta.textContent = "Searching...";
  const glanceEl = document.getElementById("at-a-glance");
  if (glanceEl)
    glanceEl.innerHTML = resolvedType === "web" ? skeletonGlance() : "";
  const resultsList = document.getElementById("results-list");
  if (resultsList) {
    if (resolvedType === "web" || resolvedType === "news") {
      resultsList.innerHTML = skeletonResults();
    } else if (resolvedType === "images") {
      resultsList.innerHTML = skeletonImageGrid();
    } else if (resolvedType === "videos") {
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
  if (resolvedType !== "web") urlParams.set("type", resolvedType);
  history.pushState(null, "", `/search?${urlParams.toString()}`);

  const commands = await _fetchCommands();
  const bangQuery = commands.length
    ? getNaturalLanguageBangQuery(query, commands)
    : null;

  if (bangQuery) {
    return _performSearchWithBang(bangQuery, url, query, resolvedType);
  }

  try {
    const res = await fetch(url);
    const data = (await res.json()) as SearchResponse;
    state.currentResults = data.results;
    state.currentData = data;

    const metaText = `About ${data.results.length} results (${(data.totalTime / 1000).toFixed(2)} seconds)`;
    setResultsMeta(metaText);

    const isMediaType = resolvedType === "images" || resolvedType === "videos";
    if (isMediaType) {
      if (glanceEl) glanceEl.innerHTML = "";
      renderMediaEngineBar(data.engineTimings ?? []);
      if (sidebar) sidebar.innerHTML = "";
    } else {
      renderSidebar(data, (q) => void performSearch(q));
      if (resolvedType === "web") {
        void fetchGlancePanels(query, data.results, data.atAGlance);
        void fetchSlotPanels(query);
      } else {
        if (glanceEl) glanceEl.innerHTML = "";
      }
    }
    renderResults(data.results);
  } catch {
    if (resultsMeta) resultsMeta.textContent = "";
    if (resultsList)
      resultsList.innerHTML =
        '<div class="no-results">Search failed. Please try again.</div>';
  }
}

async function _performSearchWithBang(
  bangQuery: string,
  searchUrl: string,
  query: string,
  type: string,
): Promise<void> {
  const glanceEl = document.getElementById("at-a-glance");
  const resultsMeta = document.getElementById("results-meta");
  const resultsList = document.getElementById("results-list");
  const sidebar = document.getElementById("results-sidebar");
  try {
    const [cmdRes, searchRes] = await Promise.all([
      fetch(`/api/command?q=${encodeURIComponent(bangQuery)}`),
      fetch(searchUrl),
    ]);
    const searchData = (await searchRes.json()) as SearchResponse;
    state.currentResults = searchData.results;
    state.currentData = searchData;
    const metaText = `About ${searchData.results.length} results (${(searchData.totalTime / 1000).toFixed(2)} seconds)`;
    setResultsMeta(metaText);
    const isMediaType = type === "images" || type === "videos";
    if (isMediaType) {
      if (glanceEl) glanceEl.innerHTML = "";
      renderMediaEngineBar(searchData.engineTimings ?? []);
      if (sidebar) sidebar.innerHTML = "";
    } else {
      renderSidebar(searchData, (q) => void performSearch(q));
      if (type === "web") {
        void fetchSlotPanels(query);
      } else {
        if (glanceEl) glanceEl.innerHTML = "";
      }
    }
    renderResults(searchData.results);

    if (glanceEl && cmdRes.ok && !isMediaType) {
      const cmdData = (await cmdRes.json()) as {
        type: string;
        results?: ScoredResult[];
        atAGlance?: { snippet: string } | null;
        title?: string;
        html?: string;
      };
      const glanceHtml = buildCommandGlanceHtml(cmdData);
      if (glanceHtml) {
        glanceEl.innerHTML = glanceHtml;
      } else if (cmdData.title !== undefined && cmdData.html !== undefined) {
        glanceEl.innerHTML = `<div class="command-result">${cmdData.html || ""}</div>`;
        runScriptsInContainer(glanceEl);
      }
    }
  } catch {
    if (resultsMeta) resultsMeta.textContent = "";
    if (resultsList)
      resultsList.innerHTML =
        '<div class="no-results">Search failed. Please try again.</div>';
  }
}

async function _performBangCommand(
  query: string,
  _type: string,
  page = 1,
): Promise<void> {

  closeMediaPreview();
  hideAcDropdown(document.getElementById("ac-dropdown-home"));
  hideAcDropdown(document.getElementById("ac-dropdown-results"));
  const resultsInput = document.getElementById(
    "results-search-input",
  ) as HTMLInputElement | null;
  if (resultsInput) resultsInput.value = query;
  const resultsMeta = document.getElementById("results-meta");
  if (resultsMeta) resultsMeta.textContent = "Running command...";
  const glanceEl = document.getElementById("at-a-glance");
  if (glanceEl) glanceEl.innerHTML = "";
  const resultsList = document.getElementById("results-list");
  if (resultsList)
    resultsList.innerHTML =
      '<div class="loading-dots"><span></span><span></span><span></span></div>';
  const pagination = document.getElementById("pagination");
  if (pagination) pagination.innerHTML = "";
  const sidebar = document.getElementById("results-sidebar");
  if (sidebar) sidebar.innerHTML = "";
  clearSlotPanels();
  document.title = `${query} - degoog`;

  state.currentBangQuery = query;

  const urlParams = new URLSearchParams({ q: query });
  if (page > 1) urlParams.set("page", String(page));
  history.pushState(null, "", `/search?${urlParams.toString()}`);

  try {
    const apiParams = new URLSearchParams({ q: query });
    if (page > 1) apiParams.set("page", String(page));
    if (state.currentTimeFilter && state.currentTimeFilter !== "any") {
      apiParams.set("time", state.currentTimeFilter);
    }
    const res = await fetch(`/api/command?${apiParams.toString()}`);
    if (!res.ok) throw new Error("not found");
    const data = (await res.json()) as {
      type: string;
      results?: ScoredResult[];
      totalTime?: number;
      atAGlance?: {
        snippet: string;
        url: string;
        title: string;
        sources: string[];
      } | null;
      title?: string;
      html?: string;
      totalPages?: number;
      page?: number;
    };
    if (data.type === "engine") {
      state.currentResults = data.results ?? [];
      state.currentData = data as unknown as SearchResponse;
      if (resultsMeta)
        resultsMeta.textContent = `About ${data.results?.length ?? 0} results (${((data.totalTime ?? 0) / 1000).toFixed(2)} seconds)`;
      renderAtAGlance(data.atAGlance ?? null);
      renderResults(data.results ?? []);
      return;
    }
    if (resultsMeta) resultsMeta.textContent = data.title ?? "";
    if (resultsList) resultsList.innerHTML = data.html || "";
    runScriptsInContainer(resultsList);
    if (data.totalPages && data.totalPages > 1 && pagination) {
      _renderBangPagination(
        pagination,
        data.totalPages,
        data.page ?? page,
        query,
      );
    }
  } catch {
    if (resultsMeta) resultsMeta.textContent = "";
    if (resultsList)
      resultsList.innerHTML =
        '<div class="no-results">Unknown command. Type <strong>!help</strong> for available commands.</div>';
  }
}

function _renderBangPagination(
  container: HTMLElement,
  totalPages: number,
  activePage: number,
  query: string,
): void {
  container.innerHTML = `<div class="pagination">${buildPaginationHtml(totalPages, activePage)}</div>`;
  container.querySelectorAll<HTMLElement>("[data-page]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const pageNum = parseInt(el.dataset.page ?? "0", 10);
      if (pageNum >= 1 && pageNum <= totalPages) {
        void _performBangCommand(query, "web", pageNum);
      }
    });
  });
}

export async function goToPage(pageNum: number): Promise<void> {
  if (pageNum === state.currentPage) return;
  const resultsList = document.getElementById("results-list");
  const pagination = document.getElementById("pagination");
  if (resultsList) {
    if (state.currentType === "web" || state.currentType === "news") {
      resultsList.innerHTML = skeletonResults();
    } else if (state.currentType === "images") {
      resultsList.innerHTML = skeletonImageGrid();
    } else if (state.currentType === "videos") {
      resultsList.innerHTML = skeletonVideoGrid();
    } else {
      resultsList.innerHTML = skeletonResults();
    }
  }
  if (pagination) pagination.innerHTML = "";
  const engines = await getEngines();
  const url = buildSearchUrl(
    state.currentQuery,
    engines,
    state.currentType,
    pageNum,
  );
  try {
    const res = await fetch(url);
    const data = (await res.json()) as SearchResponse;
    state.currentResults = data.results;
    state.currentData = data;
    state.currentPage = pageNum;
    const metaText = `About ${state.currentResults.length} results — Page ${state.currentPage}`;
    setResultsMeta(metaText);
    if (state.currentPage === 1 && data.atAGlance) {
      renderAtAGlance(data.atAGlance);
    }
    if (state.currentType === "web") {
      void fetchSlotPanels(state.currentQuery);
    }
    renderResults(state.currentResults);
    window.scrollTo(0, 0);
  } catch {
    if (resultsList)
      resultsList.innerHTML =
        '<div class="no-results">Search failed. Please try again.</div>';
  }
}

export async function retryEngine(engineName: string): Promise<void> {
  if (!state.currentQuery || !state.currentData) return;

  const engines = await getEngines();
  const params = new URLSearchParams({
    q: state.currentQuery,
    engine: engineName,
  });
  for (const [key, val] of Object.entries(engines)) {
    params.set(key, String(val));
  }
  if (state.currentType && state.currentType !== "web") {
    params.set("type", state.currentType);
  }
  if (state.currentPage > 1) {
    params.set("page", String(state.currentPage));
  }
  if (state.currentTimeFilter && state.currentTimeFilter !== "any") {
    params.set("time", state.currentTimeFilter);
  }

  try {
    const res = await fetch(`/api/search/retry?${params.toString()}`);
    const data = (await res.json()) as SearchResponse & {
      results: ScoredResult[];
    };

    if (data.engineTimings && state.currentData) {
      state.currentData.engineTimings = data.engineTimings;
    }

    if (data.results && data.results.length > state.currentResults.length) {
      state.currentResults = data.results;
      if (state.currentData) {
        state.currentData.results = data.results;
        if (data.atAGlance) state.currentData.atAGlance = data.atAGlance;
      }

      const resultsMeta = document.getElementById("results-meta");
      if (resultsMeta)
        resultsMeta.textContent = `About ${data.results.length} results (${((state.currentData?.totalTime ?? 0) / 1000).toFixed(2)} seconds)`;

      if (state.currentType === "web" && state.currentData?.atAGlance) {
        renderAtAGlance(state.currentData.atAGlance);
      }
      renderResults(data.results);
    }

    const isMediaType =
      state.currentType === "images" || state.currentType === "videos";
    if (isMediaType && state.currentData) {
      renderMediaEngineBar(state.currentData.engineTimings ?? []);
    } else if (state.currentData) {
      renderSidebar(state.currentData, (q) => void performSearch(q));
    }
  } catch { }
}

export async function performLucky(query: string): Promise<void> {
  if (!query.trim()) return;
  const engines = await getEngines();
  const params = new URLSearchParams({ q: query });
  for (const [key, val] of Object.entries(engines)) {
    params.set(key, String(val));
  }
  window.location.href = `/api/lucky?${params.toString()}`;
}
