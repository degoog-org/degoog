import {
  skeletonGlance,
  skeletonImageGrid,
  skeletonResults,
  skeletonSidebar,
} from "../../animations/skeleton";
import { closeMediaPreview } from "../../modules/media/media";
import {
  clearSlotPanels,
  renderResults,
  renderSidebar,
} from "../../modules/renderer/render";
import { renderMediaEngineBar } from "../../modules/renderer/render-media";
import { state } from "../../state";
import { SlotPanelPosition, type SearchResponse } from "../../types";
import { abortAcReq, hideAcDropdown } from "../autocomplete";
import { setActiveTab, showAllTabs } from "../navigation";
import { setResultsMeta } from "../search-helpers";
import {
  abortGlancePanels,
  abortSlotPanels,
  fetchGlancePanels,
  fetchSlotPanels,
} from "../search-utils";
import { isImageSearchType } from "../engines";
import { imgFilterRecord } from "../url";
import { getBase } from "../base-url";

type Navigate = (query: string) => void;

export const prepareResultsUi = (query: string, resolvedType: string): void => {
  const isImageType = isImageSearchType(resolvedType);

  state.currentBangQuery = "";
  showAllTabs();
  setActiveTab(resolvedType);
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
  const layout = document.getElementById("results-layout");
  if (isImageType) {
    layout?.classList.add("media-mode");
  } else {
    layout?.classList.remove("media-mode");
  }
  const resultsMeta = document.getElementById("results-meta");
  if (resultsMeta) resultsMeta.textContent = "Searching...";
  clearSlotPanels();
  if (isImageType) {
    abortGlancePanels();
    abortSlotPanels();
  }
  const glanceEl = document.getElementById("at-a-glance");
  if (glanceEl)
    glanceEl.innerHTML = resolvedType === "web" ? skeletonGlance() : "";
  const resultsList = document.getElementById("results-list");
  if (resultsList) {
    resultsList.innerHTML = isImageType
      ? skeletonImageGrid()
      : skeletonResults();
  }
  const pagination = document.getElementById("pagination");
  if (pagination) pagination.innerHTML = "";
  const sidebar = document.getElementById("results-sidebar");
  if (sidebar) sidebar.innerHTML = isImageType ? "" : skeletonSidebar();
  document.title = `${query} - degoog`;
};

export const pushSearchHistory = (
  query: string,
  resolvedType: string,
  resolvedPage: number,
  isInit: boolean,
): void => {
  const isImageType = isImageSearchType(resolvedType);
  const historyState = {
    degoog: true,
    query,
    type: resolvedType,
    page: resolvedPage,
    imageFilter: isImageType ? { ...state.imageFilter } : undefined,
  };
  const apply = (url: string) =>
    isInit
      ? history.replaceState(historyState, "", url)
      : history.pushState(historyState, "", url);

  if (state.postMethodEnabled) {
    apply(`${getBase()}/search`);
    return;
  }
  const urlParams = new URLSearchParams({ q: query });
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
  opts: { fetchGlance: boolean },
): void => {
  state.currentResults = data.results;
  state.currentData = data;

  const metaText = `About ${data.results.length} results (${(data.totalTime / 1000).toFixed(2)} seconds)`;
  setResultsMeta(metaText);

  const glanceEl = document.getElementById("at-a-glance");
  const sidebar = document.getElementById("results-sidebar");
  const isImageType = isImageSearchType(type);

  if (isImageType) {
    if (glanceEl) glanceEl.innerHTML = "";
    renderMediaEngineBar(data.engineTimings ?? []);
    if (sidebar) sidebar.innerHTML = "";
  } else if (type === "web") {
    if (opts.fetchGlance) void fetchGlancePanels(query, data.results);
    void fetchSlotPanels(query, data.results).then((panels) => {
      const kpPanels = panels.filter(
        (p) => p.position === SlotPanelPosition.KnowledgePanel,
      );
      renderSidebar(
        data,
        navigate,
        kpPanels.length > 0 ? { sidebarTopPanels: kpPanels } : undefined,
      );
    });
  } else {
    renderSidebar(data, navigate);
    if (glanceEl) glanceEl.innerHTML = "";
  }
  renderResults(data.results);
};
