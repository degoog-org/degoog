import { SkeletonImageGrid } from "../../../animations/skeleton/skeleton-image-grid";
import { SkeletonResults } from "../../../animations/skeleton/skeleton-results";
import { SkeletonSidebar } from "../../../animations/skeleton/skeleton-sidebar";
import { clear, render } from "../../../../shared/ui/tribute/dom";
import {
  closeMediaPreview,
  MediaPreviewCloseMode,
  syncMediaPreviewPanel,
} from "../../../modules/media/media";
import {
  prependKnowledgePanels,
  renderSidebar,
  renderSidebarSuggestions,
} from "../../../modules/renderer/sidebar/render-sidebar";
import { clearSlotPanels } from "../../../modules/renderer/render-slots";
import { renderResults } from "../../../modules/renderer/render";
import { renderImgEngines } from "../../../modules/filters/image-filters";
import { isCurrentSearch, state } from "../../../state";
import {
  isImageSearchType,
  type SearchResponse,
  SlotPanelPosition,
} from "../../../../shared/search-types";
import { abortAcReq, hideAcDropdown } from "../../autocomplete/autocomplete";
import { setActiveTab, showAllTabs } from "../../navigation/navigation";
import { declaredPages, setResultsMeta } from "../search-helpers";
import { infiniteScrollOn } from "../streaming/streaming-config";
import {
  armInfinite,
  teardownInfinite,
} from "../../../modules/renderer/infinite-scroll/infinite-scroll";
import {
  abortGlancePanels,
  abortSlotPanels,
  fetchGlancePanels,
  fetchSlotPanels,
} from "../search-utils";
import { imgFilterRecord } from "../../net/url";
import { getBase } from "../../net/base-url";
import { fetchSidebarSuggestions } from "../sidebar/sidebar-suggestions";
import {
  currentSearchImage,
  noteImageQuery,
} from "../../../modules/search-image/search-image";
import { keepSearchImage } from "../../../modules/search-image/search-image-store";

const t = window.scopedT("themes/degoog");
const coreT = window.scopedT("core");

type Navigate = (query: string) => void;

let sidebarSuggestionsController: AbortController | null = null;

export const loadSidebarSuggestions = (
  query: string,
  type: string,
  navigate: Navigate,
): void => {
  sidebarSuggestionsController?.abort();
  state.currentRelatedSearches = [];
  if (isImageSearchType(type) || !state.displaySearchSuggestions) return;

  const ac = new AbortController();
  sidebarSuggestionsController = ac;
  void fetchSidebarSuggestions(query, ac.signal).then((terms) => {
    if (sidebarSuggestionsController !== ac || state.currentQuery !== query)
      return;
    state.currentRelatedSearches = terms;
    renderSidebarSuggestions(terms, navigate);
  });
};

export const prepareResultsUi = (query: string, resolvedType: string): void => {
  const isImageType = isImageSearchType(resolvedType);
  const seq = state.searchSeq;

  state.currentBangQuery = "";
  teardownInfinite();
  showAllTabs();
  setActiveTab(resolvedType);
  closeMediaPreview(MediaPreviewCloseMode.Reset);
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
  const layout = document.getElementById("results-layout");
  if (isImageType) {
    layout?.classList.add("media-mode");
  } else {
    layout?.classList.remove("media-mode");
  }
  syncMediaPreviewPanel(isImageType);
  const resultsMeta = document.getElementById("results-meta");
  if (resultsMeta) resultsMeta.textContent = t("search-templates.status.searching");
  clearSlotPanels();
  if (isImageType) {
    abortGlancePanels();
    abortSlotPanels();
  } else {
    void fetchSlotPanels(query).then((panels) => {
      if (!isCurrentSearch(seq)) return;
      const kp = panels.filter(
        (p) => p.position === SlotPanelPosition.KnowledgePanel,
      );
      if (kp.length > 0) prependKnowledgePanels(kp);
    });
    void fetchGlancePanels(query);
  }
  const glanceEl = document.getElementById("at-a-glance");
  if (glanceEl) clear(glanceEl);
  const resultsList = document.getElementById("results-list");
  if (resultsList) {
    render(isImageType ? SkeletonImageGrid() : SkeletonResults(), resultsList);
  }
  const pagination = document.getElementById("pagination");
  if (pagination) clear(pagination);
  const sidebar = document.getElementById("results-sidebar");
  if (sidebar) {
    if (isImageType) clear(sidebar);
    else render(SkeletonSidebar(), sidebar);
  }
  document.title = `${query || (currentSearchImage() ? coreT("search-image.title") : "")} - degoog`;
};

export const pushSearchHistory = (
  query: string,
  resolvedType: string,
  resolvedPage: number,
  isInit: boolean,
): void => {
  const isImageType = isImageSearchType(resolvedType);
  const image = currentSearchImage();
  if (image) keepSearchImage(image);
  const historyState = {
    degoog: true,
    query,
    type: resolvedType,
    page: resolvedPage,
    imageFilter: isImageType ? { ...state.imageFilter } : undefined,
    imageId: image?.id,
  };
  const apply = (url: string) =>
    isInit
      ? history.replaceState(historyState, "", url)
      : history.pushState(historyState, "", url);

  if (state.postMethodEnabled) {
    apply(`${getBase()}/search`);
    return;
  }
  const urlParams = new URLSearchParams(query || !image ? { q: query } : {});
  if (resolvedType !== "web") urlParams.set("type", resolvedType);
  if (resolvedPage > 1) urlParams.set("page", String(resolvedPage));
  if (isImageType) {
    for (const [k, v] of Object.entries(imgFilterRecord(state.imageFilter))) {
      urlParams.set(k, v);
    }
  }
  apply(`${getBase()}/search?${urlParams.toString()}`);
};

export const renderSearchResponse = (
  data: SearchResponse,
  query: string,
  type: string,
  navigate: Navigate,
  opts: { fetchGlance: boolean; restorePage?: number },
): void => {
  const seq = state.searchSeq;
  if (currentSearchImage()) noteImageQuery(query, data.imageQuery, data.imageQueryError);
  state.currentResults = data.results;
  state.currentData = data;
  state.lastPage = declaredPages(data.totalPages);

  const metaText = t("search-templates.status.done", {
    count: String(data.results.length),
    time: (data.totalTime / 1000).toFixed(2),
  });
  setResultsMeta(metaText);

  const glanceEl = document.getElementById("at-a-glance");
  const sidebar = document.getElementById("results-sidebar");
  const isImageType = isImageSearchType(type);

  if (isImageType) {
    if (glanceEl) clear(glanceEl);
    renderImgEngines(data.engineTimings ?? []);
    if (sidebar) clear(sidebar);
  } else {
    if (opts.fetchGlance) void fetchGlancePanels(query, data.results);
    void fetchSlotPanels(query, data.results).then((panels) => {
      if (!isCurrentSearch(seq)) return;
      const kpPanels = panels.filter(
        (p) => p.position === SlotPanelPosition.KnowledgePanel,
      );
      renderSidebar(
        data,
        navigate,
        kpPanels.length > 0 ? { sidebarTopPanels: kpPanels } : undefined,
      );
    });
  }
  const infinite = infiniteScrollOn() && !isImageType;
  renderResults(data.results, { paginate: !infinite });
  if (infinite) armInfinite(type, opts.restorePage ?? 1);
};
