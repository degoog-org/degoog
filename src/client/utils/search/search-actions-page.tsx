import { clear, render } from "../../../shared/ui/core/dom";
import { NoResults } from "../../../shared/ui/components/feedback/no-results";
import {
  SkeletonImageGrid,
  SkeletonResults,
} from "../../animations/skeleton";
import { getEngines, isImageSearchType } from "../engines";
import { state } from "../../state";
import { buildSearchBody, buildSearchUrl } from "../url";
import { searchAuthHeaders, appendSearchAuthParams } from "../request";
import { getBase } from "../base-url";
import type { SearchResponse } from "../../types";
import { clearSlotPanels, renderResults } from "../../modules/renderer/render";
import { teardownInfinite } from "../../modules/renderer/infinite-scroll";
import {
  abortGlancePanels,
  abortSlotFetch,
  fetchGlancePanels,
  fetchSlotPanels,
} from "../search-utils";
import { declaredPages, setResultsMeta } from "../search-helpers";

export async function goToPage(pageNum: number): Promise<void> {
  if (pageNum === state.currentPage) return;

  window.scrollTo({ top: 0, behavior: "auto" });
  teardownInfinite();

  const resultsList = document.getElementById("results-list");
  const pagination = document.getElementById("pagination");
  if (resultsList) {
    if (isImageSearchType(state.currentType)) {
      render(<SkeletonImageGrid />, resultsList);
    } else {
      render(<SkeletonResults />, resultsList);
    }
  }
  if (pagination) clear(pagination);
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
    state.lastPage = declaredPages(data.totalPages);
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
    abortGlancePanels();
    clearSlotPanels();
    const isImageType = isImageSearchType(state.currentType);
    if (state.currentPage === 1 && !isImageType) {
      void fetchGlancePanels(state.currentQuery, data.results);
    }
    if (!isImageType) {
      abortSlotFetch();
      void fetchSlotPanels(state.currentQuery, state.currentResults);
    }
    renderResults(state.currentResults);
    window.scrollTo({ top: 0, behavior: "auto" });
  } catch (err) {
    console.error("[search] page failed", err);
    if (resultsList)
      render(<NoResults>Search failed. Please try again.</NoResults>, resultsList);
  }
}
