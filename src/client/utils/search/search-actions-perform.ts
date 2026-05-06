import {
  skeletonGlance,
  skeletonImageGrid,
  skeletonResults,
  skeletonSidebar,
  skeletonVideoGrid,
} from "../../animations/skeleton";
import { BUILTIN_SEARCH_TYPES, MAX_PAGE } from "../../constants";
import {
  closeMediaPreview,
  destroyMediaObserver,
} from "../../modules/media/media";
import {
  clearSlotPanels,
  renderResults,
  renderSidebar,
} from "../../modules/renderer/render";
import { renderMediaEngineBar } from "../../modules/renderer/render-media";
import { state } from "../../state";
import {
  SlotPanelPosition,
  type Command,
  type ScoredResult,
  type SearchResponse,
} from "../../types";
import { hideAcDropdown } from "../autocomplete";
import { triggerSearchQueryEggs } from "../uovadipasqua";
import { getEngines } from "../engines";
import { setActiveTab, setTabsForBang, showAllTabs } from "../navigation";
import { buildPaginationHtml } from "../pagination";
import {
  getNaturalLanguageBangQuery,
  runScriptsInContainer,
  setResultsMeta,
} from "../search-helpers";
import {
  abortGlancePanels,
  abortSlotPanels,
  buildCommandGlanceHtml,
  fetchGlancePanels,
  fetchSlotPanels,
} from "../search-utils";
import {
  abortStreamingSearch,
  performStreamingSearch,
} from "../streaming-search";
import { buildSearchBody, buildSearchUrl } from "../url";
import { searchAuthHeaders, appendSearchAuthParams } from "../request";
import { getBase } from "../base-url";

let commandsCache: Command[] | null = null;
let _streamingConfig: { enabled: boolean } | null = null;

const _fetchStreamingConfig = async (): Promise<boolean> => {
  if (_streamingConfig) return _streamingConfig.enabled;
  try {
    const res = await fetch(`${getBase()}/api/settings/streaming`);
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
    const res = await fetch(`${getBase()}/api/commands`, { cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as { commands?: Command[] };
      commandsCache = body.commands || [];
      return commandsCache;
    }
  } catch {}
  return [];
};

export async function performSearch(
  query: string,
  type?: string,
  page?: number,
): Promise<void> {
  const resolvedType = type || state.currentType || "web";
  if (!query.trim()) return;

  void triggerSearchQueryEggs(query);

  const isInit = state.isInitialLoad;
  state.isInitialLoad = false;

  if (resolvedType.startsWith("tab:")) {
    const { performTabSearch } = await import("../../modules/tabs/tab-search");
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
      const { getPluginTabIds } = await import("../../modules/tabs/tabs");
      const knownTypes = await getPluginTabIds();
      if (knownTypes.has(prefix)) {
        const { performTabSearch } =
          await import("../../modules/tabs/tab-search");
        return performTabSearch(actualQuery, `engine:${prefix}`, page);
      }
    }
  }

  if (query.trim().startsWith("!")) {
    state.currentQuery = query;
    return _performBangCommand(query, resolvedType, page || 1);
  }

  const commands = await _fetchCommands();
  const naturalBangQuery = commands.length
    ? getNaturalLanguageBangQuery(query, commands)
    : null;

  if (
    !naturalBangQuery &&
    !state.postMethodEnabled &&
    (!page || page === 1) &&
    (await _fetchStreamingConfig())
  ) {
    abortStreamingSearch();
    return performStreamingSearch(
      query,
      resolvedType,
      (q) => void performSearch(q),
      isInit,
    );
  }

  const resolvedPage = page && page > 0 ? page : 1;
  state.currentQuery = query;
  state.currentType = resolvedType;
  state.currentPage = resolvedPage;
  state.lastPage = MAX_PAGE;
  state.imagePage = resolvedPage;
  state.imageLastPage = MAX_PAGE;
  state.videoPage = resolvedPage;
  state.videoLastPage = MAX_PAGE;
  destroyMediaObserver();

  const engines = await getEngines();
  const url = buildSearchUrl(query, engines, resolvedType, resolvedPage);

  state.currentBangQuery = "";
  showAllTabs();
  setActiveTab(resolvedType);
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
  const layout = document.getElementById("results-layout");
  if (resolvedType === "images" || resolvedType === "videos") {
    layout?.classList.add("media-mode");
  } else {
    layout?.classList.remove("media-mode");
  }
  const resultsMeta = document.getElementById("results-meta");
  if (resultsMeta) resultsMeta.textContent = "Searching...";
  clearSlotPanels();
  if (resolvedType === "images" || resolvedType === "videos") {
    abortGlancePanels();
    abortSlotPanels();
  }
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
  const isMediaType = resolvedType === "images" || resolvedType === "videos";
  if (sidebar) sidebar.innerHTML = isMediaType ? "" : skeletonSidebar();
  document.title = `${query} - degoog`;

  const historyState = {
    degoog: true,
    query,
    type: resolvedType,
    page: resolvedPage,
  };
  if (state.postMethodEnabled) {
    if (isInit) {
      history.replaceState(historyState, "", `${getBase()}/search`);
    } else {
      history.pushState(historyState, "", `${getBase()}/search`);
    }
  } else {
    const urlParams = new URLSearchParams({ q: query });
    if (resolvedType !== "web") urlParams.set("type", resolvedType);
    if (resolvedPage > 1) urlParams.set("page", String(resolvedPage));
    const getUrl = `${getBase()}/search?${urlParams.toString()}`;
    if (isInit) {
      history.replaceState(historyState, "", getUrl);
    } else {
      history.pushState(historyState, "", getUrl);
    }
  }

  if (naturalBangQuery) {
    return _performSearchWithBang(naturalBangQuery, url, query, resolvedType);
  }

  try {
    const res = state.postMethodEnabled
      ? await fetch(`${getBase()}/api/search`, {
          method: "POST",
          body: JSON.stringify(
            buildSearchBody(query, engines, resolvedType, resolvedPage),
          ),
          headers: { "Content-Type": "application/json", ...searchAuthHeaders() },
        })
      : await fetch(appendSearchAuthParams(url));

    if (!res.ok) {
      const body = await res.text().catch(() => "(unreadable)");
      console.error("[search] non-ok response", res.status, body);
      const msg =
        res.status === 429
          ? "Too many requests. Please slow down."
          : "Search failed. Please try again.";
      if (resultsMeta) resultsMeta.textContent = "";
      if (resultsList)
        resultsList.innerHTML = `<div class="no-results">${msg}</div>`;
      return;
    }
    const data = (await res.json()) as SearchResponse;
    state.currentResults = data.results;
    state.currentData = data;

    const metaText = `About ${data.results.length} results (${(data.totalTime / 1000).toFixed(2)} seconds)`;
    setResultsMeta(metaText);

    if (isMediaType) {
      if (glanceEl) glanceEl.innerHTML = "";
      renderMediaEngineBar(data.engineTimings ?? []);
      if (sidebar) sidebar.innerHTML = "";
    } else if (resolvedType === "web") {
      void fetchGlancePanels(query, data.results);
      void fetchSlotPanels(query, data.results).then((panels) => {
        const kpPanels = panels.filter(
          (p) => p.position === SlotPanelPosition.KnowledgePanel,
        );
        renderSidebar(
          data,
          (q) => void performSearch(q),
          kpPanels.length > 0 ? { sidebarTopPanels: kpPanels } : undefined,
        );
      });
    } else {
      renderSidebar(data, (q) => void performSearch(q));
      if (glanceEl) glanceEl.innerHTML = "";
    }
    renderResults(data.results);
  } catch (err) {
    console.error("[search] search failed", err);
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
      fetch(`${getBase()}/api/command?q=${encodeURIComponent(bangQuery)}`),
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
    } else if (type === "web") {
      void fetchSlotPanels(query, searchData.results).then((panels) => {
        const kpPanels = panels.filter(
          (p) => p.position === SlotPanelPosition.KnowledgePanel,
        );
        renderSidebar(
          searchData,
          (q) => void performSearch(q),
          kpPanels.length > 0 ? { sidebarTopPanels: kpPanels } : undefined,
        );
      });
    } else {
      renderSidebar(searchData, (q) => void performSearch(q));
      if (glanceEl) glanceEl.innerHTML = "";
    }
    renderResults(searchData.results);

    if (glanceEl && cmdRes.ok && !isMediaType) {
      const cmdData = (await cmdRes.json()) as {
        type: string;
        results?: ScoredResult[];
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
  } catch (err) {
    console.error("[search] bang search failed", err);
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
  if (resultsInput) {
    resultsInput.value = query;
    resultsInput.defaultValue = query;
  }
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
  if (state.postMethodEnabled) {
    history.pushState(
      { degoog: true, query, type: "web", page },
      "",
      `${getBase()}/search`,
    );
  } else {
    history.replaceState(null, "", `${getBase()}/search?${urlParams.toString()}`);
  }

  try {
    const apiParams = new URLSearchParams({ q: query });
    if (page > 1) apiParams.set("page", String(page));
    if (state.currentTimeFilter && state.currentTimeFilter !== "any") {
      apiParams.set("time", state.currentTimeFilter);
    }
    const res = await fetch(`${getBase()}/api/command?${apiParams.toString()}`);
    if (!res.ok) throw new Error("not found");
    const data = (await res.json()) as {
      type: string;
      searchType?: string;
      results?: ScoredResult[];
      engineTimings?: { name: string; time: number; resultCount: number }[];
      totalTime?: number;
      title?: string;
      html?: string;
      totalPages?: number;
      page?: number;
    };
    if (data.type === "engine") {
      const engineType = data.searchType ?? "web";
      const isMedia = engineType === "images" || engineType === "videos";
      state.currentResults = data.results ?? [];
      state.currentData = data as unknown as SearchResponse;
      state.currentType = engineType;
      state.imagePage = 1;
      state.imageLastPage = MAX_PAGE;
      state.videoPage = 1;
      state.videoLastPage = MAX_PAGE;
      destroyMediaObserver();
      setActiveTab(engineType);
      setTabsForBang(engineType);
      if (isMedia) {
        const glanceEl = document.getElementById("at-a-glance");
        if (glanceEl) glanceEl.innerHTML = "";
        const sidebar = document.getElementById("results-sidebar");
        if (sidebar) sidebar.innerHTML = "";
        renderMediaEngineBar(data.engineTimings ?? []);
      }
      if (resultsMeta)
        resultsMeta.textContent = `About ${data.results?.length ?? 0} results (${((data.totalTime ?? 0) / 1000).toFixed(2)} seconds)`;
      renderResults(data.results ?? []);
      return;
    }
    setTabsForBang(null);
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
