import { clear, render } from "../../../../shared/ui/tribute/dom";
import { NoResults } from "../../../../shared/ui/components/feedback/no-results";
import { SkeletonImageGrid } from "../../../animations/skeleton/skeleton-image-grid";
import { SkeletonResults } from "../../../animations/skeleton/skeleton-results";
import { isImageSearchType, type SearchResponse } from "../../../../shared/search-types";
import { beginSearch, isCurrentSearch, state } from "../../../state";
import { fetchResultsPage } from "../../net/url";
import { getBase } from "../../net/base-url";
import { clearSlotPanels } from "../../../modules/renderer/render-slots";
import { renderResults } from "../../../modules/renderer/render";
import { teardownInfinite } from "../../../modules/renderer/infinite-scroll/infinite-scroll";
import {
  abortGlancePanels,
  abortSlotFetch,
  streamGlancePanels,
  streamSlotPanels,
} from "../search-utils";
import { declaredPages, setResultsMeta } from "../search-helpers";

const t = window.scopedT("themes/degoog");

export async function goToPage(pageNum: number): Promise<void> {
  if (pageNum === state.currentPage) return;
  if (state.currentBangQuery) {
    const { performBangSearch } = await import("./search-actions-perform");
    return performBangSearch(state.currentBangQuery, state.currentType, pageNum);
  }

  const seq = beginSearch();
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
  try {
    const res = await fetchResultsPage(state.currentType, pageNum);
    if (!res.ok) throw new Error(`page request failed: ${res.status}`);
    const data = (await res.json()) as SearchResponse;
    if (!isCurrentSearch(seq)) return;
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
    const metaText = t("search-templates.status.page", {
      count: String(state.currentResults.length),
      page: String(state.currentPage),
    });
    setResultsMeta(metaText);
    abortGlancePanels();
    clearSlotPanels();
    const isImageType = isImageSearchType(state.currentType);
    if (state.currentPage === 1 && !isImageType) {
      void streamGlancePanels(state.currentQuery, data.results);
    }
    if (!isImageType) {
      abortSlotFetch();
      void streamSlotPanels(state.currentQuery, state.currentResults);
    }
    renderResults(state.currentResults);
    window.scrollTo({ top: 0, behavior: "auto" });
  } catch (err) {
    console.error("[search] page failed", err);
    if (!isCurrentSearch(seq)) return;
    if (resultsList)
      render(
        <NoResults>{t("search-templates.search-failed")}</NoResults>,
        resultsList,
      );
  }
}
