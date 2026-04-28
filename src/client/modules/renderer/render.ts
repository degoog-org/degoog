import { MAX_PAGE } from "../../constants";
import { state } from "../../state";
import type { ScoredResult } from "../../types";
import { cleanUrl } from "../../utils/dom";
import { buildPaginationHtml } from "../../utils/pagination";
import { goToPage } from "../../utils/search-actions";
import { renderTemplate } from "../../utils/template";
import { attachFaviconFallback } from "../../utils/favicon";
import { faviconHostname, faviconUrl, proxyImageUrl } from "../../utils/url";
import { destroyMediaObserver, setupMediaObserver } from "../media/media";
import { renderImageGrid, renderVideoGrid } from "./render-media";

import { clearSlotPanels as _clearSlots } from "./render-slots";

export { renderSidebar } from "./render-sidebar";
export {
  appendSlotPanels,
  clearSlotPanels,
  renderSlotPanels,
} from "./render-slots";

type ResultActionsFlags = {
  authenticated?: boolean;
  blockUi?: boolean;
  replaceUi?: boolean;
  scoreUi?: boolean;
};

const _resultActionsFlags = (): ResultActionsFlags =>
  (window as unknown as { __DEGOOG_RESULT_ACTIONS__?: ResultActionsFlags })
    .__DEGOOG_RESULT_ACTIONS__ ?? {};

export const buildResultContext = (
  r: ScoredResult,
  index = 0,
): Record<string, unknown> => {
  const flags = _resultActionsFlags();
  const showBlock = !!(flags.authenticated && flags.blockUi);
  const showReplace = !!(flags.authenticated && flags.replaceUi);
  const showScore = !!(flags.authenticated && flags.scoreUi);
  return {
    index,
    title: r.title,
    url: r.url,
    cite_url: cleanUrl(r.url),
    snippet: r.snippet,
    favicon_url: faviconUrl(r.url),
    favicon_host: faviconHostname(r.url),
    thumbnail_url: r.thumbnail ? proxyImageUrl(r.thumbnail) : "",
    sources: r.sources,
    duration: r.duration || "",
    link_target: state.openInNewTab ? "_blank" : "_self",
    link_rel: state.openInNewTab ? "noopener" : "",
    insecure: !!r.insecure,
    show_actions: showBlock || showReplace || showScore,
    action_block: showBlock,
    action_replace: showReplace,
    action_score: showScore,
  };
};

const _hydrateFavicons = (container: HTMLElement): void => {
  container
    .querySelectorAll<HTMLImageElement>("img.result-favicon")
    .forEach((img) => attachFaviconFallback(img));
};

export function renderResults(results: ScoredResult[]): void {
  const container = document.getElementById("results-list");
  const layout = document.getElementById("results-layout");
  if (!container || !layout) return;

  if (state.currentType === "images" || state.currentType === "videos") {
    layout.classList.add("media-mode");
  } else {
    layout.classList.remove("media-mode");
  }

  if (results.length === 0) {
    container.innerHTML = '<div class="no-results">No results found.</div>';
    if (state.currentType !== "images" && state.currentType !== "videos") {
      renderPagination(MAX_PAGE, state.currentPage);
    }

    return;
  }

  if (state.currentType === "images") {
    renderImageGrid(results, container);
    setupMediaObserver("images");
    _clearSlots();
    const pagination = document.getElementById("pagination");
    if (pagination) pagination.innerHTML = "";
    return;
  }
  if (state.currentType === "videos") {
    renderVideoGrid(results, container);
    setupMediaObserver("videos");
    _clearSlots();
    const pagination = document.getElementById("pagination");
    if (pagination) pagination.innerHTML = "";
    return;
  }

  destroyMediaObserver();

  container.innerHTML = results
    .map(
      (r, i) => renderTemplate("degoog-result", buildResultContext(r, i)) ?? "",
    )
    .join("");

  _hydrateFavicons(container);

  renderPagination(MAX_PAGE, state.currentPage);
  window.dispatchEvent(new CustomEvent("degoog-results-ready"));
}

export function renderPagination(totalPages: number, activePage: number): void {
  const container = document.getElementById("pagination");
  if (!container) return;
  if (totalPages < 1) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `<div class="pagination">${buildPaginationHtml(totalPages, activePage)}</div>`;

  container.querySelectorAll<HTMLElement>("[data-page]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const pageNum = parseInt(el.dataset.page ?? "0", 10);
      if (pageNum >= 1 && pageNum <= MAX_PAGE) void goToPage(pageNum);
    });
  });
}
