import { state } from "../../state";
import { cleanHostname, linkHref } from "../../utils/dom";
import {
  toggleMediaPreview,
  registerAppendMediaCards,
  registerImageGridPanelSync,
} from "../media/media";
import { renderTemplate } from "../../utils/template";
import type { ScoredResult } from "../../types";

const _getImageColumnCount = (grid: HTMLElement): number => {
  const w = grid.clientWidth || window.innerWidth;
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

const _imageColumns = (grid: HTMLElement): HTMLElement[] =>
  Array.from(grid.querySelectorAll<HTMLElement>(".image-column"));

function _ensureImageColumns(grid: HTMLElement): void {
  const count = _getImageColumnCount(grid);
  const columns = _imageColumns(grid);
  if (columns.length === count) return;

  const cards = Array.from(grid.querySelectorAll<HTMLElement>(".image-card"));
  grid.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const col = document.createElement("div");
    col.className = "image-column";
    grid.appendChild(col);
  }

  const freshColumns = _imageColumns(grid);
  cards.forEach((card) => {
    _shortestColumn(freshColumns).appendChild(card);
  });
  _collapsedOverflow = null;
}

let _resizeTimer: ReturnType<typeof setTimeout> | null = null;

function _clearScheduledSync(): void {
  if (_resizeTimer) {
    clearTimeout(_resizeTimer);
    _resizeTimer = null;
  }
}

function _scheduleColumnSync(grid: HTMLElement): void {
  if (_collapsedOverflow) return;
  _clearScheduledSync();
  _resizeTimer = setTimeout(() => _ensureImageColumns(grid), 200);
}

let _gridResizeObserver: ResizeObserver | null = null;

function _observeGridResize(grid: HTMLElement): void {
  _gridResizeObserver?.disconnect();
  _gridResizeObserver = new ResizeObserver(() => _scheduleColumnSync(grid));
  _gridResizeObserver.observe(grid);
}

const PANEL_COLUMN_DROP = 2;

interface _OverflowCard {
  card: HTMLElement;
  removedCol: number;
  row: number;
}

let _collapsedOverflow: _OverflowCard[] | null = null;
let _collapsedDropCount = 0;

function _scrollSelectedIntoView(grid: HTMLElement): void {
  grid
    .querySelector<HTMLElement>(".image-card.selected")
    ?.scrollIntoView({ block: "nearest" });
}

function _collapseForPanel(grid: HTMLElement): void {
  if (_collapsedOverflow) return;

  const columns = _imageColumns(grid);
  const dropCount = Math.min(PANEL_COLUMN_DROP, columns.length - 1);
  if (dropCount <= 0) return;

  const keepCount = columns.length - dropCount;
  const keep = columns.slice(0, keepCount);
  const removed = columns.slice(keepCount);
  const overflow: _OverflowCard[] = [];

  removed.forEach((col, removedCol) => {
    const target = keep[removedCol % keepCount];
    const targetRows = Array.from(
      target.children as HTMLCollectionOf<HTMLElement>,
    );

    Array.from(col.children as HTMLCollectionOf<HTMLElement>).forEach(
      (card, row) => {
        overflow.push({ card, removedCol, row });
        const anchor = targetRows[row];
        if (anchor) anchor.after(card);
        else target.appendChild(card);
      },
    );
    col.remove();
  });

  _collapsedOverflow = overflow;
  _collapsedDropCount = dropCount;
  _scrollSelectedIntoView(grid);
}

function _expandFromPanel(grid: HTMLElement): void {
  if (!_collapsedOverflow) return;

  const restored: HTMLElement[] = [];
  for (let i = 0; i < _collapsedDropCount; i++) {
    const col = document.createElement("div");
    col.className = "image-column";
    grid.appendChild(col);
    restored.push(col);
  }

  const overflow = _collapsedOverflow;
  _collapsedOverflow = null;
  _collapsedDropCount = 0;

  overflow.forEach(({ card, removedCol }) => {
    restored[removedCol].appendChild(card);
  });

  _scrollSelectedIntoView(grid);
}

const PANEL_LAYOUT_BREAKPOINT = 768;

registerImageGridPanelSync((isOpen) => {
  const grid = document.querySelector<HTMLElement>(".image-grid");
  if (!grid) return;
  if (isOpen) {
    if (window.innerWidth < PANEL_LAYOUT_BREAKPOINT) return;
    _collapseForPanel(grid);
  } else {
    _expandFromPanel(grid);
  }
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
    _ensureImageColumns(grid);
    const columns = Array.from(
      grid.querySelectorAll<HTMLElement>(".image-column"),
    );

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
