import { clear, render } from "../../../../shared/ui/tribute/dom";
import { LoadingDots } from "../../../../shared/ui/components/feedback/loading-dots";
import { NoResults } from "../../../../shared/ui/components/feedback/no-results";
import { PaginationWrap } from "../../pagination/pagination-wrap";
import { MAX_PAGE } from "../../../constants";
import {
  closeMediaPreview,
  MediaPreviewCloseMode,
} from "../../../modules/media/media";
import { destroyMediaObserver } from "../../../modules/media/media-scroll";
import { clearSlotPanels } from "../../../modules/renderer/render-slots";
import { renderResults } from "../../../modules/renderer/render";
import {
  setupInfinite,
  teardownInfinite,
} from "../../../modules/renderer/infinite-scroll/infinite-scroll";
import { renderImgEngines } from "../../../modules/filters/image-filters";
import {
  beginSearch,
  isCurrentSearch,
  state,
  takeRestoreInfinitePage,
} from "../../../state";
import type { Command } from "../../../types/extension";
import {
  isImageSearchType,
  type ScoredResult,
  type SearchResponse,
} from "../../../../shared/search-types";
import { abortAcReq, hideAcDropdown } from "../../autocomplete/autocomplete";
import { triggerUovadipasqua } from "../../app/uovadipasqua";
import {
  enabledIds,
  getEngineBangs,
  getEngines,
  getKnownSearchTypePrefixes,
} from "../engines";
import { ENGINE_BANGS_FIELD } from "../../../../shared/sync";
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
import { buildSearchBody, buildSearchUrl, fetchCommand, fetchSearch } from "../../net/url";
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

const t = window.scopedT("themes/degoog");

let commandsCache: { key: string; commands: Command[] } | null = null;

onWindowEvent("extensions-saved", () => {
  commandsCache = null;
});

const _fetchCommands = async (): Promise<Command[]> => {
  const bangs = await getEngineBangs();
  const key = new URLSearchParams({
    [ENGINE_BANGS_FIELD]: enabledIds(bangs).join(","),
  }).toString();
  if (commandsCache?.key === key) return commandsCache.commands;
  try {
    const res = await fetch(`${getBase()}/api/commands?${key}`, { cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as { commands?: Command[] };
      commandsCache = { key, commands: body.commands || [] };
      return commandsCache.commands;
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
  const restorePage = takeRestoreInfinitePage();
  const resolvedType = type || state.currentType || "web";
  if (!query.trim()) return;
  destroyMediaObserver();
  teardownInfinite();
  const seq = beginSearch();

  void import("../../../modules/filters/image-filters").then(
    ({ syncImgFilters }) => syncImgFilters(resolvedType),
  );
  void triggerUovadipasqua(query);

  const isInit = state.isInitialLoad;

  if (query.trim().startsWith("!") || /\s!\S+$/.test(query.trim())) {
    state.isInitialLoad = false;
    state.currentQuery = query;
    return _performBangCommand(query, resolvedType, page || 1, isInit);
  }

  const prefixMatch = query.trim().match(/^(\w+):(.+)$/);
  if (prefixMatch && !query.trim().startsWith("http")) {
    const prefix = prefixMatch[1].toLowerCase();
    const actualQuery = prefixMatch[2].trim();
    if (actualQuery) {
      const knownTypes = await getKnownSearchTypePrefixes();
      if (!isCurrentSearch(seq)) return;
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

  state.isInitialLoad = false;

  const commands = await _fetchCommands();
  if (!isCurrentSearch(seq)) return;
  const naturalBangQuery = commands.length
    ? getNaturalLanguageBangQuery(query, commands)
    : null;

  const streamingConfig = await fetchStreamingConfig();
  if (!isCurrentSearch(seq)) return;
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
      restorePage,
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
  if (!isCurrentSearch(seq)) return;
  const url = buildSearchUrl(query, engines, resolvedType, resolvedPage);

  prepareResultsUi(query, resolvedType);
  loadSidebarSuggestions(query, resolvedType, (q) => void performSearch(q));
  pushSearchHistory(query, resolvedType, resolvedPage, isInit);

  if (naturalBangQuery) {
    return _performSearchWithBang(
      naturalBangQuery,
      query,
      engines,
      resolvedType,
      resolvedPage,
      seq,
      restorePage,
    );
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
    if (!isCurrentSearch(seq)) return;

    if (!res.ok) {
      const body = await res.text().catch(() => "(unreadable)");
      if (!isCurrentSearch(seq)) return;
      console.error("[search] non-ok response", res.status, body);
      const msg =
        res.status === 429
          ? "Too many requests. Please slow down."
          : t("search-templates.search-failed");
      if (resultsMeta) resultsMeta.textContent = "";
      if (resultsList) render(<NoResults>{msg}</NoResults>, resultsList);
      return;
    }
    const data = (await res.json()) as SearchResponse;
    if (!isCurrentSearch(seq)) return;
    renderSearchResponse(
      data,
      query,
      resolvedType,
      (q) => void performSearch(q),
      {
        fetchGlance: true,
        restorePage,
      },
    );
  } catch (err) {
    console.error("[search] search failed", err);
    if (!isCurrentSearch(seq)) return;
    if (resultsMeta) resultsMeta.textContent = "";
    if (resultsList)
      render(
        <NoResults>{t("search-templates.search-failed")}</NoResults>,
        resultsList,
      );
  }
}

async function _performSearchWithBang(
  bangQuery: string,
  query: string,
  engines: Record<string, boolean>,
  type: string,
  page: number,
  seq: number,
  restorePage: number,
): Promise<void> {
  const glanceEl = document.getElementById("at-a-glance");
  const resultsMeta = document.getElementById("results-meta");
  const resultsList = document.getElementById("results-list");
  try {
    const [cmdRes, searchRes] = await Promise.all([
      fetchCommand(bangQuery, type, 1),
      fetchSearch(query, engines, type, page),
    ]);
    if (!searchRes.ok) {
      throw new Error(`search request failed: ${searchRes.status}`);
    }
    const searchData = (await searchRes.json()) as SearchResponse;
    if (!isCurrentSearch(seq)) return;
    const isMediaType = isImageSearchType(type);
    renderSearchResponse(
      searchData,
      query,
      type,
      (q) => void performSearch(q),
      {
        fetchGlance: false,
        restorePage,
      },
    );

    if (glanceEl && cmdRes.ok && !isMediaType) {
      const cmdData = (await cmdRes.json()) as {
        type: string;
        results?: ScoredResult[];
        title?: string;
        html?: string;
      };
      if (!isCurrentSearch(seq)) return;
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
    if (!isCurrentSearch(seq)) return;
    if (resultsMeta) resultsMeta.textContent = "";
    if (resultsList)
      render(
        <NoResults>{t("search-templates.search-failed")}</NoResults>,
        resultsList,
      );
  }
}

export const performBangSearch = (
  query: string,
  type: string,
  page: number,
): Promise<void> => _performBangCommand(query, type, page);

async function _performBangCommand(
  query: string,
  _type: string,
  page = 1,
  isInit = false,
): Promise<void> {
  const seq = beginSearch();
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
  if (resultsMeta) resultsMeta.textContent = t("search-templates.status.running-command");
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
  setTabsForBang([]);

  state.currentBangQuery = query;

  const requestedType = _type.replace(/^tab:engine:/, "") || "web";
  const bangUrl = (type: string): string => {
    const urlParams = new URLSearchParams({ q: query });
    if (type !== "web") urlParams.set("type", type);
    if (page > 1) urlParams.set("page", String(page));
    return `${getBase()}/search?${urlParams.toString()}`;
  };
  const historyState = { degoog: true, query, type: requestedType, page };
  if (state.postMethodEnabled) {
    if (isInit) {
      history.replaceState(historyState, "", `${getBase()}/search`);
    } else {
      history.pushState(historyState, "", `${getBase()}/search`);
    }
  } else {
    if (isInit) {
      history.replaceState(historyState, "", bangUrl(requestedType));
    } else {
      history.pushState(historyState, "", bangUrl(requestedType));
    }
  }

  try {
    const res = await fetchCommand(query, requestedType, page);
    if (!isCurrentSearch(seq)) return;
    if (res.status === 403) {
      const { error } = (await res.json()) as { error?: string };
      if (!isCurrentSearch(seq)) return;
      if (resultsMeta) resultsMeta.textContent = "";
      if (resultsList) render(<NoResults>{error ?? "Disabled."}</NoResults>, resultsList);
      return;
    }
    if (!res.ok) throw new Error("not found");
    const data = (await res.json()) as {
      type: string;
      primaryType?: string;
      searchTypes?: string[];
      results?: ScoredResult[];
      engineTimings?: { name: string; time: number; resultCount: number }[];
      totalTime?: number;
      title?: string;
      html?: string;
      totalPages?: number;
      page?: number;
      searchType?: string;
    };
    if (!isCurrentSearch(seq)) return;
    const commandType = data.searchType ?? "";
    if (data.type === "engine" || Array.isArray(data.results)) {
      const engineType =
        data.type === "engine" ? (data.primaryType ?? "web") : commandType || "web";
      const isMedia = isImageSearchType(engineType);
      state.currentResults = data.results ?? [];
      state.currentData = data as unknown as SearchResponse;
      state.currentType = engineType;
      state.lastPage = declaredPages(data.totalPages);
      const mediaLastPage =
        data.type === "engine" ? MAX_PAGE : Math.max(1, data.totalPages ?? 1);
      state.imagePage = page;
      state.imageLastPage = mediaLastPage;
      state.videoPage = page;
      state.videoLastPage = mediaLastPage;
      destroyMediaObserver();
      if (engineType !== requestedType) {
        history.replaceState(
          { ...historyState, type: engineType },
          "",
          state.postMethodEnabled ? `${getBase()}/search` : bangUrl(engineType),
        );
      }
      setActiveTab(engineType);
      setTabsForBang(
        data.type === "engine" && data.searchTypes?.length
          ? data.searchTypes
          : [engineType],
      );
      if (isMedia) {
        const glanceElMedia = document.getElementById("at-a-glance");
        if (glanceElMedia) clear(glanceElMedia);
        const sidebarMedia = document.getElementById("results-sidebar");
        if (sidebarMedia) clear(sidebarMedia);
      }
      if (resultsMeta)
        resultsMeta.textContent =
          data.type === "engine"
            ? t("search-templates.status.done", {
                count: String(data.results?.length ?? 0),
                time: ((data.totalTime ?? 0) / 1000).toFixed(2),
              })
            : (data.title ?? "");
      if (isMedia) renderImgEngines(data.engineTimings ?? []);
      state.currentPage = page;
      const infinite = (await fetchStreamingConfig()).infiniteScroll && !isMedia;
      if (!isCurrentSearch(seq)) return;
      renderResults(data.results ?? [], { paginate: !infinite });
      if (infinite) setupInfinite(engineType);
      return;
    }
    setTabsForBang(commandType ? [commandType] : []);
    if (commandType) {
      state.currentType = commandType;
      setActiveTab(commandType);
      document
        .getElementById("results-layout")
        ?.classList.toggle("media-mode", isImageSearchType(commandType));
      if (commandType !== requestedType) {
        history.replaceState(
          { ...historyState, type: commandType },
          "",
          state.postMethodEnabled ? `${getBase()}/search` : bangUrl(commandType),
        );
      }
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
    if (!isCurrentSearch(seq)) return;
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
