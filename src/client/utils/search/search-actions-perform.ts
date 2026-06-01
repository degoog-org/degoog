import { MAX_PAGE } from "../../constants";
import {
  closeMediaPreview,
  destroyMediaObserver,
} from "../../modules/media/media";
import { clearSlotPanels, renderResults } from "../../modules/renderer/render";
import { renderMediaEngineBar } from "../../modules/renderer/render-media";
import { state } from "../../state";
import {
  type Command,
  type ScoredResult,
  type SearchResponse,
} from "../../types";
import { abortAcReq, hideAcDropdown } from "../autocomplete";
import { triggerUovadipasqua } from "../uovadipasqua";
import {
  getEngines,
  getKnownSearchTypePrefixes,
  isImageSearchType,
} from "../engines";
import { setActiveTab, setTabsForBang } from "../navigation";
import { buildPaginationHtml } from "../pagination";
import {
  getNaturalLanguageBangQuery,
  runScriptsInContainer,
} from "../search-helpers";
import { buildCommandGlanceHtml } from "../search-utils";
import {
  abortStreamingSearch,
  performStreamingSearch,
} from "../streaming-search";
import { buildSearchBody, buildSearchUrl } from "../url";
import { searchAuthHeaders, appendSearchAuthParams } from "../request";
import { getBase } from "../base-url";
import { fetchStreamingConfig } from "../streaming-config";
import {
  prepareResultsUi,
  pushSearchHistory,
  renderSearchResponse,
} from "./search-actions-render";

let commandsCache: Command[] | null = null;

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

  void import("../../modules/filters/image-filters").then(
    ({ syncImgFilters }) => syncImgFilters(resolvedType),
  );
  void triggerUovadipasqua(query);

  const isInit = state.isInitialLoad;
  state.isInitialLoad = false;

  const prefixMatch = query.trim().match(/^(\w+):(.+)$/);
  if (prefixMatch && !query.trim().startsWith("http")) {
    const prefix = prefixMatch[1].toLowerCase();
    const actualQuery = prefixMatch[2].trim();
    if (actualQuery) {
      const knownTypes = await getKnownSearchTypePrefixes();
      if (knownTypes.has(prefix)) {
        const { performTabSearch } =
          await import("../../modules/tabs/tab-search");
        return performTabSearch(actualQuery, `engine:${prefix}`, page);
      }
    }
  }

  if (resolvedType.startsWith("tab:")) {
    const { performTabSearch } = await import("../../modules/tabs/tab-search");
    return performTabSearch(query, resolvedType.slice(4), page);
  }

  if (query.trim().startsWith("!") || /\s!\S+$/.test(query.trim())) {
    state.currentQuery = query;
    return _performBangCommand(query, resolvedType, page || 1, isInit);
  }

  const commands = await _fetchCommands();
  const naturalBangQuery = commands.length
    ? getNaturalLanguageBangQuery(query, commands)
    : null;

  if (
    !naturalBangQuery &&
    !state.postMethodEnabled &&
    (!page || page === 1) &&
    (await fetchStreamingConfig())
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

  prepareResultsUi(query, resolvedType);
  pushSearchHistory(query, resolvedType, resolvedPage, isInit);

  if (naturalBangQuery) {
    return _performSearchWithBang(naturalBangQuery, url, query, resolvedType);
  }

  const resultsMeta = document.getElementById("results-meta");
  const resultsList = document.getElementById("results-list");

  try {
    const res = state.postMethodEnabled
      ? await fetch(`${getBase()}/api/search`, {
          method: "POST",
          body: JSON.stringify(
            buildSearchBody(query, engines, resolvedType, resolvedPage),
          ),
          headers: {
            "Content-Type": "application/json",
            ...searchAuthHeaders(),
          },
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
    renderSearchResponse(
      data,
      query,
      resolvedType,
      (q) => void performSearch(q),
      {
        fetchGlance: true,
      },
    );
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
  try {
    const [cmdRes, searchRes] = await Promise.all([
      fetch(`${getBase()}/api/command?q=${encodeURIComponent(bangQuery)}`),
      fetch(searchUrl),
    ]);
    const searchData = (await searchRes.json()) as SearchResponse;
    const isMediaType = isImageSearchType(type);
    renderSearchResponse(
      searchData,
      query,
      type,
      (q) => void performSearch(q),
      {
        fetchGlance: false,
      },
    );

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
  isInit = false,
): Promise<void> {
  closeMediaPreview();
  abortAcReq();
  hideAcDropdown(document.getElementById("ac-dropdown-home"));
  hideAcDropdown(document.getElementById("ac-dropdown-results"));
  (document.activeElement as HTMLElement | null)?.blur();
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
  setTabsForBang(null);

  state.currentBangQuery = query;

  const urlParams = new URLSearchParams({ q: query });
  if (page > 1) urlParams.set("page", String(page));
  const historyState = { degoog: true, query, type: "web", page };
  if (state.postMethodEnabled) {
    if (isInit) {
      history.replaceState(historyState, "", `${getBase()}/search`);
    } else {
      history.pushState(historyState, "", `${getBase()}/search`);
    }
  } else {
    if (isInit) {
      history.replaceState(
        historyState,
        "",
        `${getBase()}/search?${urlParams.toString()}`,
      );
    } else {
      history.pushState(
        historyState,
        "",
        `${getBase()}/search?${urlParams.toString()}`,
      );
    }
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
      primaryType?: string;
      results?: ScoredResult[];
      engineTimings?: { name: string; time: number; resultCount: number }[];
      totalTime?: number;
      title?: string;
      html?: string;
      totalPages?: number;
      page?: number;
    };
    if (data.type === "engine") {
      const engineType = data.primaryType ?? "web";
      const isMedia = isImageSearchType(engineType);
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
        const glanceElMedia = document.getElementById("at-a-glance");
        if (glanceElMedia) glanceElMedia.innerHTML = "";
        const sidebarMedia = document.getElementById("results-sidebar");
        if (sidebarMedia) sidebarMedia.innerHTML = "";
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
