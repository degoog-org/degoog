import { clear, render } from "../../../../shared/ui/tribute/dom";
import { LoadingDots } from "../../../../shared/ui/components/feedback/loading-dots";
import { NoResults } from "../../../../shared/ui/components/feedback/no-results";
import { PaginationWrap } from "../../pagination/pagination-wrap";
import { MAX_PAGE } from "../../../constants";
import {
  closeMediaPreview,
  destroyMediaObserver,
  MediaPreviewCloseMode,
} from "../../../modules/media/media";
import { clearSlotPanels } from "../../../modules/renderer/render-slots";
import { renderResults } from "../../../modules/renderer/render";
import { teardownInfinite } from "../../../modules/renderer/infinite-scroll/infinite-scroll";
import { renderImgEngines } from "../../../modules/filters/image-filters";
import { state } from "../../../state";
import type { Command } from "../../../types/extension";
import {
  isImageSearchType,
  type ScoredResult,
  type SearchResponse,
} from "../../../../shared/search-types";
import { abortAcReq, hideAcDropdown } from "../../autocomplete/autocomplete";
import { triggerUovadipasqua } from "../../app/uovadipasqua";
import { getEngines, getKnownSearchTypePrefixes } from "../engines";
import { setActiveTab, setTabsForBang } from "../../navigation/navigation";
import { Pagination } from "../../pagination/pagination";
import {
  getNaturalLanguageBangQuery,
  declaredPages,
  runScriptsInContainer,
} from "../search-helpers";
import { buildCommandGlance } from "../search-utils";
import {
  abortStreamingSearch,
  performStreamingSearch,
} from "../streaming/streaming-search";
import { buildSearchBody, buildSearchUrl } from "../../net/url";
import { searchAuthHeaders, appendSearchAuthParams } from "../../net/request";
import { getBase } from "../../net/base-url";
import { onWindowEvent } from "../../dom/window-event";
import { fetchStreamingConfig } from "../streaming/streaming-config";
import {
  loadSidebarSuggestions,
  prepareResultsUi,
  pushSearchHistory,
  renderSearchResponse,
} from "./search-actions-render";

let commandsCache: Command[] | null = null;

onWindowEvent("extensions-saved", () => {
  commandsCache = null;
});

const _fetchCommands = async (): Promise<Command[]> => {
  if (commandsCache) return commandsCache;
  try {
    const res = await fetch(`${getBase()}/api/commands`, { cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as { commands?: Command[] };
      commandsCache = body.commands || [];
      return commandsCache;
    }
  } catch (err) {
    console.debug("[search] commands fetch failed", err);
  }
  return [];
};

export async function performSearch(
  query: string,
  type?: string,
  page?: number,
): Promise<void> {
  const resolvedType = type || state.currentType || "web";
  if (!query.trim()) return;

  void import("../../../modules/filters/image-filters").then(
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
          await import("../../../modules/tabs/tab-search");
        return performTabSearch(actualQuery, `engine:${prefix}`, page);
      }
    }
  }

  if (resolvedType.startsWith("tab:")) {
    const { performTabSearch } = await import("../../../modules/tabs/tab-search");
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

  const streamingConfig = await fetchStreamingConfig();
  if (
    !naturalBangQuery &&
    !state.postMethodEnabled &&
    (!page || page === 1) &&
    streamingConfig.enabled &&
    !streamingConfig.disabledTypes.includes(resolvedType)
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
  state.lastPage = null;
  state.imagePage = resolvedPage;
  state.imageLastPage = MAX_PAGE;
  state.videoPage = resolvedPage;
  state.videoLastPage = MAX_PAGE;
  destroyMediaObserver();

  const engines = await getEngines();
  const url = buildSearchUrl(query, engines, resolvedType, resolvedPage);

  prepareResultsUi(query, resolvedType);
  loadSidebarSuggestions(query, resolvedType, (q) => void performSearch(q));
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
      if (resultsList) render(<NoResults>{msg}</NoResults>, resultsList);
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
      render(
        <NoResults>Search failed. Please try again.</NoResults>,
        resultsList,
      );
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
      fetch(appendSearchAuthParams(searchUrl)),
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
      const glance = buildCommandGlance(cmdData);
      if (glance) {
        clear(glanceEl);
        render(glance, glanceEl);
      } else if (cmdData.title !== undefined && cmdData.html !== undefined) {
        glanceEl.innerHTML = `<div class="command-result">${cmdData.html || ""}</div>`;
        runScriptsInContainer(glanceEl);
      }
    }
  } catch (err) {
    console.error("[search] bang search failed", err);
    if (resultsMeta) resultsMeta.textContent = "";
    if (resultsList)
      render(
        <NoResults>Search failed. Please try again.</NoResults>,
        resultsList,
      );
  }
}

async function _performBangCommand(
  query: string,
  _type: string,
  page = 1,
  isInit = false,
): Promise<void> {
  closeMediaPreview(MediaPreviewCloseMode.Reset);
  abortStreamingSearch();
  teardownInfinite();
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
  if (glanceEl) clear(glanceEl);
  const resultsList = document.getElementById("results-list");
  if (resultsList) render(<LoadingDots />, resultsList);
  const pagination = document.getElementById("pagination");
  if (pagination) clear(pagination);
  const sidebar = document.getElementById("results-sidebar");
  if (sidebar) clear(sidebar);
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
    apiParams.set("type", _type);
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
      state.lastPage = declaredPages(data.totalPages);
      state.imagePage = 1;
      state.imageLastPage = MAX_PAGE;
      state.videoPage = 1;
      state.videoLastPage = MAX_PAGE;
      destroyMediaObserver();
      setActiveTab(engineType);
      setTabsForBang(engineType);
      if (isMedia) {
        const glanceElMedia = document.getElementById("at-a-glance");
        if (glanceElMedia) clear(glanceElMedia);
        const sidebarMedia = document.getElementById("results-sidebar");
        if (sidebarMedia) clear(sidebarMedia);
      }
      if (resultsMeta)
        resultsMeta.textContent = `About ${data.results?.length ?? 0} results (${((data.totalTime ?? 0) / 1000).toFixed(2)} seconds)`;
      if (isMedia) renderImgEngines(data.engineTimings ?? []);
      state.currentPage = page;
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
      render(
        <NoResults>
          Unknown command. Type <strong>!help</strong> for available commands.
        </NoResults>,
        resultsList,
      );
  }
}

function _renderBangPagination(
  container: HTMLElement,
  totalPages: number,
  activePage: number,
  query: string,
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
        void _performBangCommand(query, "web", pageNum);
      }
    });
  });
}
