import { state } from "../../state";
import { escapeHtml, cleanHostname } from "../../utils/dom";
import { proxyImageUrl } from "../../utils/url";
import { openMediaPreview, registerAppendMediaCards } from "../media/media";
import { setupRetryLinks } from "./render-sidebar";
import type { ScoredResult, EngineTiming } from "../../types";

const _getImageColumnCount = (): number => {
  const w = window.innerWidth;
  if (w <= 800) return 3;
  if (w <= 1100) return 4;
  if (w <= 1400) return 5;
  return 6;
};

const _shortestColumn = (columns: HTMLElement[]): HTMLElement =>
  columns.reduce((a, b) => {
    if (a.offsetHeight < b.offsetHeight) return a;
    if (b.offsetHeight < a.offsetHeight) return b;
    return a.children.length <= b.children.length ? a : b;
  });

function _ensureImageColumns(grid: HTMLElement): void {
  const count = _getImageColumnCount();
  const existing = grid.querySelectorAll(".image-column").length;
  if (existing === count) return;

  const cards = Array.from(grid.querySelectorAll<HTMLElement>(".image-card"));
  grid.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const col = document.createElement("div");
    col.className = "image-column";
    grid.appendChild(col);
  }

  const columns = Array.from(
    grid.querySelectorAll<HTMLElement>(".image-column"),
  );
  cards.forEach((card) => {
    _shortestColumn(columns).appendChild(card);
  });
}

let _resizeTimer: ReturnType<typeof setTimeout> | null = null;

function _handleResize(): void {
  if (_resizeTimer) clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    const grid = document.querySelector<HTMLElement>(".image-grid");
    if (grid) _ensureImageColumns(grid);
  }, 200);
}

let _resizeListenerAdded = false;

export function appendMediaCards(
  grid: HTMLElement,
  results: ScoredResult[],
  type: "image" | "video",
): void {
  const cardClass = type === "image" ? "image-card" : "video-card";
  const selector = `.${cardClass}`;
  const startIdx = grid.querySelectorAll(`.${cardClass}`).length;

  if (type === "image") {
    _ensureImageColumns(grid);
    const columns = Array.from(
      grid.querySelectorAll<HTMLElement>(".image-column"),
    );

    results.forEach((r, i) => {
      const idx = startIdx + i;
      const card = document.createElement("div");
      card.className = cardClass;
      card.dataset.idx = String(idx);
      card.innerHTML = `
        <div class="image-thumb-wrap">
          <img class="image-thumb" src="${escapeHtml(proxyImageUrl(r.thumbnail || ""))}" alt="${escapeHtml(r.title)}" loading="lazy" onerror="this.parentElement.parentElement.style.display='none'">
        </div>
        <div class="image-info">
          <span class="image-title">${escapeHtml(r.title)}</span>
          <span class="image-source">${escapeHtml(cleanHostname(r.url))}</span>
        </div>`;
      card.addEventListener("click", () => {
        openMediaPreview(state.currentResults[idx], idx, selector);
      });
      _shortestColumn(columns).appendChild(card);
    });

    if (!_resizeListenerAdded) {
      window.addEventListener("resize", _handleResize);
      _resizeListenerAdded = true;
    }
  } else {
    const fragment = document.createDocumentFragment();
    results.forEach((r, i) => {
      const idx = startIdx + i;
      const card = document.createElement("div");
      card.className = cardClass;
      card.dataset.idx = String(idx);
      card.innerHTML = `
        <div class="video-thumb-wrap">
          <img class="video-thumb" src="${escapeHtml(proxyImageUrl(r.thumbnail || ""))}" alt="${escapeHtml(r.title)}" loading="lazy" onerror="this.style.display='none'">
          ${r.duration ? `<span class="video-duration">${escapeHtml(r.duration)}</span>` : ""}
          <div class="video-play-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
        </div>
        <div class="video-info">
          <span class="video-title">${escapeHtml(r.title)}</span>
          <span class="video-source">${escapeHtml(cleanHostname(r.url))}</span>
        </div>`;
      card.addEventListener("click", () => {
        openMediaPreview(state.currentResults[idx], idx, selector);
      });
      fragment.appendChild(card);
    });
    grid.appendChild(fragment);
  }
}

registerAppendMediaCards(appendMediaCards);

export function renderImageGrid(
  results: ScoredResult[],
  container: HTMLElement,
): void {
  let grid = container.querySelector<HTMLElement>(".image-grid");
  if (!grid) {
    container.innerHTML =
      '<div class="image-grid"></div><div class="media-scroll-sentinel"></div>';
    grid = container.querySelector<HTMLElement>(".image-grid")!;
  }
  appendMediaCards(grid, results, "image");
}

export function renderVideoGrid(
  results: ScoredResult[],
  container: HTMLElement,
): void {
  let grid = container.querySelector<HTMLElement>(".video-grid");
  if (!grid) {
    container.innerHTML =
      '<div class="video-grid"></div><div class="media-scroll-sentinel"></div>';
    grid = container.querySelector<HTMLElement>(".video-grid")!;
  }
  appendMediaCards(grid, results, "video");
}

export function renderMediaEngineBar(timings: EngineTiming[]): void {
  const el = document.getElementById("results-meta");
  if (!el) return;
  el.querySelector(".media-engine-bar")?.remove();
  if (!timings.length) return;
  const tags = timings
    .map((et) => {
      const hit = et.resultCount > 0;
      return `<span class="result-engine-tag${hit ? "" : " media-engine-tag--miss"}">${escapeHtml(et.name)} · ${et.resultCount} <a class="engine-retry-link" data-engine="${escapeHtml(et.name)}">retry</a></span>`;
    })
    .join("");
  const bar = document.createElement("div");
  bar.className = "media-engine-bar";
  bar.innerHTML = tags;
  el.appendChild(bar);
  setupRetryLinks(bar);
}
