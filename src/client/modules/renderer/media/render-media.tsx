import { clear, render } from "../../../../shared/ui/tribute/dom";
import { MediaGridShell } from "./media-grid-shell";
import { state } from "../../../state";
import { cleanHostname, linkHref } from "../../../../shared/utils/url";
import {
  toggleMediaPreview,
  registerImageGridPanelSync,
  remapCurrentMediaIdx,
} from "../../media/media";
import { registerAppendMediaCards } from "../../media/media-scroll";
import { renderTemplate } from "../../../utils/dom/template";
import type { ScoredResult } from "../../../../shared/search-types";
import {
  applyResultRanking,
  hasResultRanking,
  RANK_HIDDEN_CLASS,
  registerRankingRelayout,
} from "./result-ranking";
import {
  averageCardHeight,
  keepPlacedOrder,
  shortestColumn,
  type ColumnLoad,
} from "./image-columns";

const COLUMN_STEPS: ReadonlyArray<{ upTo: number; columns: number }> = [
  { upTo: 800, columns: 3 },
  { upTo: 1100, columns: 4 },
  { upTo: 1400, columns: 5 },
];
const COLUMN_MAX = 6;
const RELAYOUT_DELAY_MS = 120;

const _cardUrls = new WeakMap<HTMLElement, string>();

const _getImageColumnCount = (grid: HTMLElement): number => {
  const width = grid.clientWidth || window.innerWidth;
  return COLUMN_STEPS.find((step) => width <= step.upTo)?.columns ?? COLUMN_MAX;
};

const _isDeadCard = (card: Element): boolean =>
  (card as HTMLElement).style.display === "none" ||
  card.classList.contains(RANK_HIDDEN_CLASS);

const _liveCount = (column: HTMLElement): number =>
  Array.from(column.children).filter((child) => !_isDeadCard(child)).length;

const _heightInWidths = (el: HTMLElement): number => {
  const width = el.offsetWidth;
  return width > 0 ? el.offsetHeight / width : 0;
};

const _measureColumns = (columns: HTMLElement[]): ColumnLoad[] =>
  columns.map((column) => ({
    height: _heightInWidths(column),
    cards: _liveCount(column),
  }));

const _emptyLoads = (columns: HTMLElement[]): ColumnLoad[] =>
  columns.map(() => ({ height: 0, cards: 0 }));

const _columnPacker = (
  columns: HTMLElement[],
  loads: ColumnLoad[],
): ((card: HTMLElement, height: number) => void) => (card, height) => {
  if (_isDeadCard(card)) {
    columns[0].appendChild(card);
    return;
  }

  const best = shortestColumn(loads);
  loads[best].height += height;
  loads[best].cards += 1;
  columns[best].appendChild(card);
};

const _imageGrid = (): HTMLElement | null =>
  document.querySelector<HTMLElement>(".image-grid");

const _imageColumns = (grid: HTMLElement): HTMLElement[] =>
  Array.from(grid.querySelectorAll<HTMLElement>(".image-column"));

const _byIdx = (a: HTMLElement, b: HTMLElement): number =>
  Number(a.dataset.idx ?? 0) - Number(b.dataset.idx ?? 0);

const _cardsInResultOrder = (grid: HTMLElement): HTMLElement[] =>
  Array.from(grid.querySelectorAll<HTMLElement>(".image-card")).sort(_byIdx);

function _scrollSelectedIntoView(grid: HTMLElement): void {
  grid
    .querySelector<HTMLElement>(".image-card.selected")
    ?.scrollIntoView({ block: "nearest" });
}

function _rebuildColumns(grid: HTMLElement, count: number): HTMLElement[] {
  const cards = _cardsInResultOrder(grid);
  const heights = cards.map(_heightInWidths);
  const columns: HTMLElement[] = [];

  grid.replaceChildren();
  for (let i = 0; i < count; i++) {
    const col = document.createElement("div");
    col.className = "image-column";
    columns.push(col);
    grid.appendChild(col);
  }

  const place = _columnPacker(columns, _emptyLoads(columns));
  cards.forEach((card, i) => place(card, heights[i]));
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

const _relayoutRankedGrid = (grid: HTMLElement): void => {
  if (grid.classList.contains("image-grid")) {
    _rebuildColumns(grid, _getImageColumnCount(grid));
    _scrollSelectedIntoView(grid);
    return;
  }
  const cards = Array.from(grid.children) as HTMLElement[];
  cards.sort(_byIdx).forEach((card) => grid.appendChild(card));
};

registerRankingRelayout(_relayoutRankedGrid);

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

const _mediaCard = (
  r: ScoredResult,
  idx: number,
  type: "image" | "video",
): HTMLElement => {
  const cardClass = type === "image" ? "image-card" : "video-card";
  const templateId =
    type === "image" ? "degoog-image-card" : "degoog-video-card";
  const card = document.createElement("div");
  card.className = cardClass;
  card.dataset.idx = String(idx);
  card.innerHTML = renderTemplate(templateId, _buildMediaContext(r)) ?? "";
  card.addEventListener("click", () => {
    const current = Number(card.dataset.idx);
    toggleMediaPreview(state.currentResults[current], current, `.${cardClass}`);
  });
  _cardUrls.set(card, r.url);
  return card;
};

const _applyRankingIfNeeded = (results: ScoredResult[]): void => {
  if (hasResultRanking() || results.some((r) => r.visual)) applyResultRanking();
};

export function appendMediaCards(
  grid: HTMLElement,
  results: ScoredResult[],
  type: "image" | "video",
): void {
  const startIdx = grid.querySelectorAll(
    type === "image" ? ".image-card" : ".video-card",
  ).length;

  if (type === "image") {
    const columns = _ensureImageColumns(grid);
    const loads = _measureColumns(columns);
    const height = averageCardHeight(loads);
    const place = _columnPacker(columns, loads);
    results.forEach((r, i) => place(_mediaCard(r, startIdx + i, type), height));
    _observeGridResize(grid);
  } else {
    const fragment = document.createDocumentFragment();
    results.forEach((r, i) => {
      fragment.appendChild(_mediaCard(r, startIdx + i, type));
    });
    grid.appendChild(fragment);
  }

  _applyRankingIfNeeded(results);
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

const _placedPrefix = (column: HTMLElement, fold: number): HTMLElement[] => {
  const cards = Array.from(column.children) as HTMLElement[];
  const cut = cards.findIndex((card) => {
    const rect = card.getBoundingClientRect();
    return rect.height > 0 && rect.top >= fold;
  });
  return cut < 0 ? cards : cards.slice(0, cut);
};

const _placedLoad = (column: HTMLElement, placed: HTMLElement[]): ColumnLoad => {
  const last = placed.at(-1);
  const width = column.offsetWidth;
  if (!last || width === 0) return { height: 0, cards: 0 };
  const bottom =
    last.getBoundingClientRect().bottom - column.getBoundingClientRect().top;
  return {
    height: bottom / width,
    cards: placed.filter((card) => !_isDeadCard(card)).length,
  };
};

export const streamImageGrid = (
  batch: ScoredResult[],
  container: HTMLElement,
): ScoredResult[] => {
  const grid = container.querySelector<HTMLElement>(".image-grid");
  const shown = grid ? _cardsInResultOrder(grid) : [];
  if (!grid || shown.length === 0) {
    state.currentResults = batch;
    renderImageGrid(batch, container);
    return batch;
  }

  const columns = _ensureImageColumns(grid);
  const placedByColumn = columns.map((column) =>
    _placedPrefix(column, window.innerHeight),
  );
  const loads = columns.map((column, i) =>
    _placedLoad(column, placedByColumn[i]),
  );
  const placed = new Set(placedByColumn.flat());
  const previous = state.currentResults;
  const resultOf = (card: HTMLElement): ScoredResult | undefined =>
    previous[Number(card.dataset.idx)];
  const placedCards = shown.filter((card) => placed.has(card) && resultOf(card));
  const kept = new Set(placedCards);
  const movable = shown.filter((card) => !kept.has(card));
  const heights = new Map(movable.map((card) => [card, _heightInWidths(card)]));
  const estimate = averageCardHeight(loads);

  const next = keepPlacedOrder(
    placedCards.flatMap((card) => resultOf(card) ?? []),
    batch,
  );
  const nextIdx = new Map(next.map((r, i) => [r.url, i]));
  const cardsByUrl = new Map(shown.map((card) => [_cardUrls.get(card), card]));

  remapCurrentMediaIdx((old) => {
    const url = previous[old]?.url;
    return url === undefined ? old : (nextIdx.get(url) ?? old);
  });
  state.currentResults = next;
  placedCards.forEach((card, i) => {
    card.dataset.idx = String(i);
  });
  movable.forEach((card) => card.remove());

  const place = _columnPacker(columns, loads);
  next.slice(placedCards.length).forEach((r, offset) => {
    const idx = placedCards.length + offset;
    const card = cardsByUrl.get(r.url) ?? _mediaCard(r, idx, "image");
    card.dataset.idx = String(idx);
    place(card, heights.get(card) ?? estimate);
  });

  _observeGridResize(grid);
  _applyRankingIfNeeded(batch);
  return state.currentResults;
};
