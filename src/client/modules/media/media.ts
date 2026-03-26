import { state } from "../../state";
import { getEngines } from "../../utils/engines";
import { buildSearchUrl, proxyImageUrl } from "../../utils/url";
import { escapeHtml, cleanHostname } from "../../utils/dom";
import { openLightbox } from "./lightbox";
import type { ScoredResult } from "../../types";

let mediaObserver: IntersectionObserver | null = null;
let appendMediaCardsRef:
  | ((
      grid: HTMLElement,
      results: ScoredResult[],
      type: "image" | "video",
    ) => void)
  | null = null;
let currentMediaIdx = -1;
let currentCardSelector = "";

export function registerAppendMediaCards(
  fn: (
    grid: HTMLElement,
    results: ScoredResult[],
    type: "image" | "video",
  ) => void,
): void {
  appendMediaCardsRef = fn;
}

export function destroyMediaObserver(): void {
  if (mediaObserver) {
    mediaObserver.disconnect();
    mediaObserver = null;
  }
}

export function setupMediaObserver(type: string): void {
  destroyMediaObserver();
  const sentinel = document.querySelector<HTMLElement>(
    ".media-scroll-sentinel",
  );
  if (!sentinel) return;

  mediaObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && !state.mediaLoading) {
        void loadMoreMedia(type);
      }
    },
    { rootMargin: "400px" },
  );

  mediaObserver.observe(sentinel);
}

export async function loadMoreMedia(type: string): Promise<void> {
  const page = type === "images" ? state.imagePage : state.videoPage;
  const lastPg = type === "images" ? state.imageLastPage : state.videoLastPage;
  const nextPage = page + 1;
  if (nextPage > lastPg || state.mediaLoading) return;

  state.mediaLoading = true;
  const sentinel = document.querySelector<HTMLElement>(
    ".media-scroll-sentinel",
  );
  if (sentinel)
    sentinel.innerHTML =
      '<div class="loading-dots"><span></span><span></span><span></span></div>';

  const engines = await getEngines();
  const url = buildSearchUrl(state.currentQuery, engines, type, nextPage);
  try {
    const res = await fetch(url);
    const data = (await res.json()) as { results: ScoredResult[] };
    if (data.results.length === 0) {
      if (type === "images") state.imageLastPage = page;
      else state.videoLastPage = page;
    } else {
      state.currentResults = state.currentResults.concat(data.results);
      if (type === "images") state.imagePage = nextPage;
      else state.videoPage = nextPage;

      const container = document.getElementById("results-list");
      const grid = container?.querySelector<HTMLElement>(
        type === "images" ? ".image-grid" : ".video-grid",
      );
      if (grid && appendMediaCardsRef) {
        appendMediaCardsRef(
          grid,
          data.results,
          type === "images" ? "image" : "video",
        );
      }
    }
  } finally {
    state.mediaLoading = false;
    if (sentinel) sentinel.innerHTML = "";
  }
}

export function openMediaPreview(
  item: ScoredResult,
  idx: number,
  cardSelector: string,
): void {
  const panel = document.getElementById("media-preview-panel");
  const img = document.getElementById(
    "media-preview-img",
  ) as HTMLImageElement | null;
  const info = document.getElementById("media-preview-info");

  currentMediaIdx = idx;
  currentCardSelector = cardSelector;

  const previewSrc = item.imageUrl || item.thumbnail || "";
  if (img) {
    img.src = proxyImageUrl(previewSrc) || "";
    img.style.cursor = "zoom-in";
    img.onclick = () => {
      const src = img.src;
      if (src) openLightbox(src);
    };
  }
  if (info) {
    const target = state.openInNewTab ? ' target="_blank" rel="noopener"' : "";
    const engines = item.sources?.length
      ? `<div class="media-preview-engines">${item.sources.map((s) => `<span class="result-engine-tag">${escapeHtml(s)}</span>`).join("")}</div>`
      : "";
    const downloadUrl = previewSrc ? proxyImageUrl(previewSrc) : "";
    const downloadFilename = (() => {
      try {
        const p = new URL(previewSrc).pathname;
        return p.split("/").filter(Boolean).pop() || "image";
      } catch {
        return "image";
      }
    })();
    info.innerHTML = `
      <h3 class="media-preview-title">${escapeHtml(item.title)}</h3>
      <a class="media-preview-link" href="${escapeHtml(item.url)}"${target}>${escapeHtml(cleanHostname(item.url))}</a>
      ${engines}
      <div class="media-preview-actions">
        <a class="btn btn--primary media-preview-visit" href="${escapeHtml(item.url)}"${target}>Visit page</a>
        ${downloadUrl ? `<a class="btn btn--secondary media-preview-download" href="${escapeHtml(downloadUrl)}" download="${escapeHtml(downloadFilename)}">Download</a>` : ""}
      </div>
    `;
  }

  panel?.classList.add("open");

  document
    .querySelectorAll<HTMLElement>(cardSelector)
    .forEach((c) => c.classList.remove("selected"));
  document
    .querySelector<HTMLElement>(`${cardSelector}[data-idx="${idx}"]`)
    ?.classList.add("selected");

  _updateNavButtons();
}

function _updateNavButtons(): void {
  const prevBtn = document.getElementById("media-preview-prev");
  const nextBtn = document.getElementById("media-preview-next");
  if (prevBtn)
    (prevBtn as HTMLButtonElement).disabled = !_findColumnTarget(
      currentCardSelector,
      currentMediaIdx,
      -1,
    );
  if (nextBtn)
    (nextBtn as HTMLButtonElement).disabled = !_findColumnTarget(
      currentCardSelector,
      currentMediaIdx,
      1,
    );
}

const _visibleCards = (parent: Element, selector: string): HTMLElement[] =>
  Array.from(parent.querySelectorAll<HTMLElement>(selector)).filter(
    (c) => c.offsetParent !== null,
  );

const _findColumnTarget = (
  selector: string,
  idx: number,
  direction: -1 | 1,
): HTMLElement | null => {
  const currentCard = document.querySelector<HTMLElement>(
    `${selector}[data-idx="${idx}"]`,
  );
  if (!currentCard) return null;

  const column = currentCard.closest(
    ".image-column, .video-column",
  ) as HTMLElement | null;
  if (!column) {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= state.currentResults.length) return null;
    return document.querySelector<HTMLElement>(
      `${selector}[data-idx="${newIdx}"]`,
    );
  }

  const grid = column.parentElement;
  if (!grid) return null;

  const columns = Array.from(grid.children) as HTMLElement[];
  const colIdx = columns.indexOf(column);
  const cardsInCol = _visibleCards(column, selector);
  const cardPosInCol = cardsInCol.indexOf(currentCard);

  const nextColIdx = colIdx + direction;
  if (nextColIdx >= 0 && nextColIdx < columns.length) {
    const nextCards = _visibleCards(columns[nextColIdx], selector);
    if (nextCards.length === 0) return null;
    return nextCards[Math.min(cardPosInCol, nextCards.length - 1)];
  }

  if (direction === 1) {
    const firstCards = _visibleCards(columns[0], selector);
    const target = cardPosInCol + 1;
    if (target < firstCards.length) return firstCards[target];
  } else {
    const lastCards = _visibleCards(columns[columns.length - 1], selector);
    const target = cardPosInCol - 1;
    if (target >= 0) return lastCards[target];
  }

  return null;
};

export function navigateMediaPreview(direction: -1 | 1): void {
  const target = _findColumnTarget(
    currentCardSelector,
    currentMediaIdx,
    direction,
  );
  if (!target) return;

  const newIdx = parseInt(target.dataset.idx!, 10);
  const item = state.currentResults[newIdx];
  if (!item) return;
  openMediaPreview(item, newIdx, currentCardSelector);
  target.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

export function closeMediaPreview(): void {
  document.getElementById("media-preview-panel")?.classList.remove("open");
  document
    .querySelectorAll<HTMLElement>(".image-card, .video-card")
    .forEach((c) => c.classList.remove("selected"));
  currentMediaIdx = -1;
}
