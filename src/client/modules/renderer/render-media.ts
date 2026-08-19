import { state } from "../../state";
import { cleanHostname, linkHref } from "../../utils/dom";
import {
  toggleMediaPreview,
  registerAppendMediaCards,
  registerImageGridPanelSync,
} from "../media/media";
import { renderTemplate } from "../../utils/template";
import type { ScoredResult } from "../../types";

const COLUMN_STEPS: ReadonlyArray<{ upTo: number; columns: number }> = [
  { upTo: 800, columns: 3 },
  { upTo: 1100, columns: 4 },
  { upTo: 1400, columns: 5 },
];
const COLUMN_MAX = 6;
const RELAYOUT_DELAY_MS = 120;

const _getImageColumnCount = (grid: HTMLElement): number => {
  const width = grid.clientWidth || window.innerWidth;
  return COLUMN_STEPS.find((step) => width <= step.upTo)?.columns ?? COLUMN_MAX;
};

const _shortestColumn = (columns: HTMLElement[]): HTMLElement =>
  columns.reduce((a, b) => {
    if (a.offsetHeight < b.offsetHeight) return a;
    if (b.offsetHeight < a.offsetHeight) return b;
    return a.children.length <= b.children.length ? a : b;
  });

const _imageColumns = (grid: HTMLElement): HTMLElement[] =>
  Array.from(grid.querySelectorAll<HTMLElement>(".image-column"));

const _cardsInResultOrder = (grid: HTMLElement): HTMLElement[] =>
  Array.from(grid.querySelectorAll<HTMLElement>(".image-card")).sort(
    (a, b) => Number(a.dataset.idx ?? 0) - Number(b.dataset.idx ?? 0),
  );

function _scrollSelectedIntoView(grid: HTMLElement): void {
  grid
    .querySelector<HTMLElement>(".image-card.selected")
    ?.scrollIntoView({ block: "nearest" });
}

function _rebuildColumns(grid: HTMLElement, count: number): HTMLElement[] {
  const cards = _cardsInResultOrder(grid);
  const columns: HTMLElement[] = [];

  grid.replaceChildren();
  for (let i = 0; i < count; i++) {
    const col = document.createElement("div");
    col.className = "image-column";
    columns.push(col);
    grid.appendChild(col);
  }

  cards.forEach((card) => _shortestColumn(columns).appendChild(card));
  return columns;
}

function _ensureImageColumns(grid: HTMLElement): HTMLElement[] {
  const count = _getImageColumnCount(grid);
  const columns = _imageColumns(grid);
  if (columns.length === count) return columns;

  const rebuilt = _rebuildColumns(grid, count);
  _scrollSelectedIntoView(grid);
  return rebuilt;
}

let _resizeTimer: ReturnType<typeof setTimeout> | null = null;

function _scheduleColumnSync(grid: HTMLElement): void {
  if (_resizeTimer) clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    _resizeTimer = null;
    _ensureImageColumns(grid);
  }, RELAYOUT_DELAY_MS);
}

let _gridResizeObserver: ResizeObserver | null = null;

function _observeGridResize(grid: HTMLElement): void {
  _gridResizeObserver?.disconnect();
  _gridResizeObserver = new ResizeObserver(() => _scheduleColumnSync(grid));
  _gridResizeObserver.observe(grid);
}

export const PANEL_LAYOUT_BREAKPOINT = 768;

registerImageGridPanelSync(() => {
  const grid = document.querySelector<HTMLElement>(".image-grid");
  if (!grid) return;
  requestAnimationFrame(() => _ensureImageColumns(grid));
});

const _imageCardUrl = (r: ScoredResult): string => {
  const thumbnail = r.thumbnail || "";
  if (!state.inlineGifPlayback || !r.isGif || !r.imageUrl) return thumbnail;
  return r.imageUrl;
};

const _buildMediaContext = (r: ScoredResult): Record<string, unknown> => ({
  title: r.title,
  url: linkHref(r.url),
  thumbnail_url: _imageCardUrl(r),
  fallback_url: r.thumbnail || "",
  hostname: cleanHostname(r.url),
  duration: r.duration || "",
  sources: r.sources,
});

export function appendMediaCards(
  grid: HTMLElement,
  results: ScoredResult[],
  type: "image" | "video",
): void {
  const cardClass = type === "image" ? "image-card" : "video-card";
  const selector = `.${cardClass}`;
  const startIdx = grid.querySelectorAll(`.${cardClass}`).length;
  const templateId =
    type === "image" ? "degoog-image-card" : "degoog-video-card";

  if (type === "image") {
    const columns = _ensureImageColumns(grid);

    results.forEach((r, i) => {
      const idx = startIdx + i;
      const card = document.createElement("div");
      card.className = cardClass;
      card.dataset.idx = String(idx);
      card.innerHTML = renderTemplate(templateId, _buildMediaContext(r)) ?? "";
      card.addEventListener("click", () => {
        toggleMediaPreview(state.currentResults[idx], idx, selector);
      });
      _shortestColumn(columns).appendChild(card);
    });

    _observeGridResize(grid);
  } else {
    const fragment = document.createDocumentFragment();
    results.forEach((r, i) => {
      const idx = startIdx + i;
      const card = document.createElement("div");
      card.className = cardClass;
      card.dataset.idx = String(idx);
      card.innerHTML = renderTemplate(templateId, _buildMediaContext(r)) ?? "";
      card.addEventListener("click", () => {
        toggleMediaPreview(state.currentResults[idx], idx, selector);
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
  } else {
    grid.innerHTML = "";
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
  } else {
    grid.innerHTML = "";
  }
  appendMediaCards(grid, results, "video");
}
