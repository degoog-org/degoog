import {
  skeletonImageGrid,
  skeletonResults,
  skeletonVideoGrid,
} from "../../animations/skeleton";
import { getEngines } from "../engines";
import { state } from "../../state";
import { buildSearchBody, buildSearchUrl } from "../url";
import { searchAuthHeaders, appendSearchAuthParams } from "../request";
import { getBase } from "../base-url";
import type { SearchResponse } from "../../types";
import { renderResults } from "../../modules/renderer/render";
import { fetchGlancePanels, fetchSlotPanels } from "../search-utils";
import { setResultsMeta } from "../search-helpers";

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
    const res = state.postMethodEnabled
      ? await fetch(`${getBase()}/api/search`, {
          method: "POST",
          body: JSON.stringify(
            buildSearchBody(
              state.currentQuery,
              engines,
              state.currentType,
              pageNum,
            ),
          ),
          headers: {
            "Content-Type": "application/json",
            ...searchAuthHeaders(),
          },
        })
      : await fetch(appendSearchAuthParams(url));

    const data = (await res.json()) as SearchResponse;
    state.currentResults = data.results;
    state.currentData = data;
    state.currentPage = pageNum;
    const pageHistoryState = {
      degoog: true,
      query: state.currentQuery,
      type: state.currentType,
      page: pageNum,
    };
    if (state.postMethodEnabled) {
      history.pushState(pageHistoryState, "", `${getBase()}/search`);
    } else {
      const urlParams = new URLSearchParams({ q: state.currentQuery });
      if (state.currentType !== "web") urlParams.set("type", state.currentType);
      if (pageNum > 1) urlParams.set("page", String(pageNum));
      history.pushState(
        pageHistoryState,
        "",
        `${getBase()}/search?${urlParams.toString()}`,
      );
    }
    const metaText = `About ${state.currentResults.length} results - Page ${state.currentPage}`;
    setResultsMeta(metaText);
    if (state.currentPage === 1 && state.currentType === "web") {
      void fetchGlancePanels(state.currentQuery, data.results);
    }
    if (state.currentType === "web") {
      void fetchSlotPanels(state.currentQuery, state.currentResults);
    }
    renderResults(state.currentResults);
    window.scrollTo(0, 0);
  } catch (err) {
    console.error("[search] page failed", err);
    if (resultsList)
      resultsList.innerHTML =
        '<div class="no-results">Search failed. Please try again.</div>';
  }
}
