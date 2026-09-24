import { clear, render } from "../../../../shared/ui/tribute/dom";
import { MediaGridShell } from "./media-grid-shell";
import { state } from "../../../state";
import { cleanHostname, linkHref } from "../../../utils/dom/dom";
import {
  toggleMediaPreview,
  registerAppendMediaCards,
  registerImageGridPanelSync,
} from "../../media/media";
import { renderTemplate } from "../../../utils/dom/template";
import type { ScoredResult } from "../../../../shared/search-types";

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

const _isDeadCard = (card: Element): boolean =>
  (card as HTMLElement).style.display === "none";

const _liveCount = (column: HTMLElement): number =>
  Array.from(column.children).filter((child) => !_isDeadCard(child)).length;

const _columnPacker = (
  columns: HTMLElement[],
): ((card: HTMLElement) => void) => {
  const counts = columns.map(_liveCount);

  return (card) => {
    if (_isDeadCard(card)) {
      columns[0].appendChild(card);
      return;
    }

    let best = 0;
    for (let i = 1; i < columns.length; i++) {
      const height = columns[i].offsetHeight;
      const bestHeight = columns[best].offsetHeight;
      if (
        height < bestHeight ||
        (height === bestHeight && counts[i] < counts[best])
      ) {
        best = i;
      }
    }

    counts[best] += 1;
    columns[best].appendChild(card);
  };
};

const _imageGrid = (): HTMLElement | null =>
  document.querySelector<HTMLElement>(".image-grid");

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

  const place = _columnPacker(columns);
  cards.forEach(place);
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

export function syncImageGridColumns(): void {
  const grid = _imageGrid();
  if (!grid) return;
  if (_resizeTimer) {
    clearTimeout(_resizeTimer);
    _resizeTimer = null;
  }
  requestAnimationFrame(() => _ensureImageColumns(grid));
}

export const PANEL_LAYOUT_BREAKPOINT = 768;

registerImageGridPanelSync(syncImageGridColumns);

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
    const place = _columnPacker(columns);

    results.forEach((r, i) => {
      const idx = startIdx + i;
      const card = document.createElement("div");
      card.className = cardClass;
      card.dataset.idx = String(idx);
      card.innerHTML = renderTemplate(templateId, _buildMediaContext(r)) ?? "";
      card.addEventListener("click", () => {
        toggleMediaPreview(state.currentResults[idx], idx, selector);
      });
      place(card);
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
    render(<MediaGridShell />, container);
    grid = container.querySelector<HTMLElement>(".image-grid")!;
  } else {
    clear(grid);
  }
  appendMediaCards(grid, results, "image");
}
