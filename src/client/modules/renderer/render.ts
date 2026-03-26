import { state } from "../../state";
import { MAX_PAGE } from "../../constants";
import { escapeHtml, cleanUrl } from "../../utils/dom";
import { faviconUrl, proxyImageUrl } from "../../utils/url";
import { buildPaginationHtml } from "../../utils/pagination";
import { setupMediaObserver, destroyMediaObserver } from "../media/media";
import { renderImageGrid, renderVideoGrid } from "./render-media";
import { goToPage } from "../../utils/search-actions";
import type { ScoredResult } from "../../types";

export {
  clearSlotPanels,
  renderSlotPanels,
  appendSlotPanels,
  renderAtAGlance,
} from "./render-slots";
export { renderSidebar } from "./render-sidebar";

export function renderResults(results: ScoredResult[]): void {
  const container = document.getElementById("results-list");
  const layout = document.querySelector<HTMLElement>(".results-layout");
  if (!container || !layout) return;

  if (state.currentType === "images" || state.currentType === "videos") {
    layout.classList.add("media-mode");
  } else {
    layout.classList.remove("media-mode");
  }

  if (results.length === 0) {
    container.innerHTML = '<div class="no-results">No results found.</div>';
    if (state.currentType === "all" || state.currentType === "news") {
      renderPagination(MAX_PAGE, state.currentPage);
    }
    return;
  }

  if (state.currentType === "images") {
    renderImageGrid(results, container);
    setupMediaObserver("images");
    const pagination = document.getElementById("pagination");
    if (pagination) pagination.innerHTML = "";
    return;
  }
  if (state.currentType === "videos") {
    renderVideoGrid(results, container);
    setupMediaObserver("videos");
    const pagination = document.getElementById("pagination");
    if (pagination) pagination.innerHTML = "";
    return;
  }

  destroyMediaObserver();

  container.innerHTML = results
    .map((r) => {
      const thumbBlock =
        r.thumbnail &&
        `<div class="result-thumbnail-wrap"><img class="result-thumbnail-img" src="${escapeHtml(proxyImageUrl(r.thumbnail))}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`;
      const body = `
      <div class="result-url-row">
        <img class="result-favicon" src="${faviconUrl(r.url)}" alt="" width="26" height="26" onerror="this.style.display='none'">
        <cite class="result-cite">${escapeHtml(cleanUrl(r.url))}</cite>
      </div>
      <a class="result-title" href="${escapeHtml(r.url)}"${state.openInNewTab ? ' target="_blank" rel="noopener"' : ""}>${escapeHtml(r.title)}</a>
      <p class="result-snippet">${escapeHtml(r.snippet)}</p>
      <div class="result-engines">${r.sources.map((s) => `<span class="result-engine-tag">${escapeHtml(s)}</span>`).join("")}</div>`;
      if (thumbBlock) {
        return `<div class="result-item"><div class="result-item-inner">${thumbBlock}<div class="result-body">${body}</div></div></div>`;
      }
      return `<div class="result-item">${body}</div>`;
    })
    .join("");

  if (state.currentType === "all" || state.currentType === "news") {
    renderPagination(MAX_PAGE, state.currentPage);
  }
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
