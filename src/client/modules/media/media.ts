import { state } from "../../state";
import { getBase } from "../../utils/base-url";
import type { ScoredResult } from "../../types";
import { cleanHostname, escapeHtml } from "../../utils/dom";
import { getEngines, isImageSearchType } from "../../utils/engines";
import { buildSearchBody, buildSearchUrl, faviconHostname } from "../../utils/url";
import { attachFaviconFallback } from "../../utils/favicon";
import { openLightbox } from "./lightbox";
import { searchAuthHeaders, appendSearchAuthParams } from "../../utils/request";
import { renderTemplate } from "../../utils/template";

const MORE_IMAGES_COUNT = 15;

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

const syncFilters = (open: boolean): void => {
  void import("../filters/image-filters").then((m) => {
    if (open) m.syncImgFilters(state.currentType);
    else m.toggleImgSidebar(false);
  });
};

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
  const isImage = isImageSearchType(type);
  const page = isImage ? state.imagePage : state.videoPage;
  const lastPg = isImage ? state.imageLastPage : state.videoLastPage;
  const nextPage = page + 1;
  if (nextPage > lastPg || state.mediaLoading) return;

  state.mediaLoading = true;
  const sentinel = document.querySelector<HTMLElement>(
    ".media-scroll-sentinel",
  );
  if (sentinel)
    sentinel.innerHTML =
      '<div class="loading-dots"><span></span><span></span><span></span></div>';

  const bangQuery = state.currentBangQuery;
  let res: Response;
  try {
    if (bangQuery) {
      const params = new URLSearchParams({
        q: bangQuery,
        page: String(nextPage),
      });
      res = await fetch(`${getBase()}/api/command?${params.toString()}`);
    } else {
      const engines = await getEngines();
      res = state.postMethodEnabled
        ? await fetch(`${getBase()}/api/search`, {
          method: "POST",
          body: JSON.stringify(
            buildSearchBody(state.currentQuery, engines, type, nextPage),
          ),
          headers: {
            "Content-Type": "application/json",
            ...searchAuthHeaders(),
          },
        })
        : await fetch(
          appendSearchAuthParams(
            buildSearchUrl(state.currentQuery, engines, type, nextPage),
          ),
        );
    }

    const raw = (await res.json()) as {
      results?: ScoredResult[];
      type?: string;
    };
    const data = { results: raw.results ?? [] };
    if (data.results.length === 0) {
      if (isImage) state.imageLastPage = page;
      else state.videoLastPage = page;
    } else {
      state.currentResults = state.currentResults.concat(data.results);
      if (isImage) state.imagePage = nextPage;
      else state.videoPage = nextPage;

      const container = document.getElementById("results-list");
      const grid = container?.querySelector<HTMLElement>(
        isImage ? ".image-grid" : ".video-grid",
      );
      if (grid && appendMediaCardsRef) {
        appendMediaCardsRef(
          grid,
          data.results,
          isImage ? "image" : "video",
        );
      }
    }
  } finally {
    state.mediaLoading = false;
    if (sentinel) sentinel.innerHTML = "";
  }
}

export function toggleMediaPreview(
  item: ScoredResult,
  idx: number,
  cardSelector: string,
): void {
  const isOpen = document
    .getElementById("media-preview-panel")
    ?.classList.contains("open");

  if (isOpen && currentMediaIdx === idx && currentCardSelector === cardSelector) {
    closeMediaPreview();
    return;
  }

  openMediaPreview(item, idx, cardSelector);
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

  _setPreviewSource(item);

  const isVideo = cardSelector === ".video-card";
  const previewSrc = item.imageUrl || item.thumbnail || "";

  const imgWrap = document.querySelector<HTMLElement>(
    ".media-preview-img-wrap",
  );
  imgWrap?.querySelector(".media-preview-embed")?.remove();

  if (img) {
    const fallbackSrc = previewSrc === item.thumbnail ? item.imageUrl || "" : item.thumbnail || "";
    img.dataset.triedFallback = "";
    img.style.display = "";
    img.src = previewSrc || "";
    img.style.cursor = "zoom-in";
    img.onclick = () => {
      const src = img.src;
      if (src) openLightbox(src);
    };
    img.onerror = () => {
      if (!img.dataset.triedFallback && fallbackSrc && fallbackSrc !== img.src) {
        img.dataset.triedFallback = "1";
        img.src = fallbackSrc;
      } else {
        img.style.display = "none";
      }
    };
  }

  if (info) {
    const target = state.openInNewTab ? ' target="_blank" rel="noopener"' : "";
    const engines = item.sources?.length
      ? `<div class="media-preview-engines">${item.sources.map((s) => `<span class="result-engine-tag degoog-badge">${escapeHtml(s)}</span>`).join("")}</div>`
      : "";

    let actions: string;
    if (isVideo) {
      actions = `<a class="btn btn--primary degoog-btn degoog-btn--primary media-preview-visit" href="${escapeHtml(item.url)}"${target}>Watch video</a>`;
    } else {
      const downloadUrl = previewSrc || "";
      const downloadFilename = (() => {
        try {
          const p = new URL(previewSrc).pathname;
          return p.split("/").filter(Boolean).pop() || "image";
        } catch {
          return "image";
        }
      })();
      actions = `
        <a class="btn btn--primary degoog-btn degoog-btn--primary media-preview-visit" href="${escapeHtml(item.url)}"${target}>Visit page</a>
        ${downloadUrl ? `<a class="btn btn--secondary degoog-btn degoog-btn--secondary media-preview-download" href="${escapeHtml(downloadUrl)}" download="${escapeHtml(downloadFilename)}">Download</a>` : ""}
      `;
    }

    info.innerHTML = `
      <h3 class="media-preview-title">${escapeHtml(item.title)}</h3>
      <a class="media-preview-link" href="${escapeHtml(item.url)}"${target}>${escapeHtml(cleanHostname(item.url))}</a>
      ${engines}
      <div class="media-preview-actions">${actions}</div>
    `;
  }

  _renderMoreMedia(idx, cardSelector);

  panel?.classList.add("open");
  syncFilters(false);

  document
    .querySelectorAll<HTMLElement>(cardSelector)
    .forEach((c) => c.classList.remove("selected"));
  document
    .querySelector<HTMLElement>(`${cardSelector}[data-idx="${idx}"]`)
    ?.classList.add("selected");

  _updateNavButtons();
}

const _setPreviewSource = (item: ScoredResult): void => {
  const domain = document.getElementById("media-preview-domain");
  if (domain) domain.textContent = cleanHostname(item.url);

  const favWrap = document.getElementById("media-preview-favicon-wrap");
  if (!favWrap) return;

  const favicon = document.createElement("img");
  favicon.className = "media-preview-favicon";
  favicon.alt = "";
  favicon.dataset.faviconHost = faviconHostname(item.url);
  favWrap.innerHTML = "";
  favWrap.appendChild(favicon);
  attachFaviconFallback(favicon);
};

const _isMediaLoaded = (idx: number, cardSelector: string): boolean => {
  const card = document.querySelector<HTMLElement>(
    `${cardSelector}[data-idx="${idx}"]`,
  );
  if (!card || card.style.display === "none") return false;

  const thumbSelector =
    cardSelector === ".video-card" ? ".video-thumb" : ".image-thumb";
  const thumb = card.querySelector<HTMLImageElement>(thumbSelector);
  if (!thumb || thumb.style.display === "none") return false;

  return thumb.complete && thumb.naturalWidth > 0;
};

const _pickOtherMedia = (
  excludeIdx: number,
  count: number,
  cardSelector: string,
): number[] => {
  const pool: number[] = [];
  state.currentResults.forEach((r, i) => {
    if (i === excludeIdx) return;
    if (!(r.thumbnail || r.imageUrl)) return;
    if (!_isMediaLoaded(i, cardSelector)) return;
    pool.push(i);
  });

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, count);
};

const _renderMoreMedia = (excludeIdx: number, cardSelector: string): void => {
  const container = document.getElementById("media-preview-more");
  if (!container) return;

  const picks = _pickOtherMedia(excludeIdx, MORE_IMAGES_COUNT, cardSelector);
  container.innerHTML = "";
  if (picks.length === 0) return;

  const grid = document.createElement("div");
  grid.className = "media-preview-more-grid";

  picks.forEach((idx) => {
    const r = state.currentResults[idx];
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "media-preview-more-item";

    const thumb = document.createElement("img");
    thumb.className = "media-preview-more-img";
    thumb.loading = "lazy";
    thumb.src = r.thumbnail || r.imageUrl || "";
    thumb.alt = r.title || "";
    thumb.onerror = () => {
      if (!thumb.dataset.triedFallback && r.imageUrl && r.imageUrl !== thumb.src) {
        thumb.dataset.triedFallback = "1";
        thumb.src = r.imageUrl;
      } else {
        cell.style.display = "none";
      }
    };
    cell.appendChild(thumb);

    cell.addEventListener("click", () => {
      openMediaPreview(state.currentResults[idx], idx, cardSelector);
      document
        .querySelector<HTMLElement>(`${cardSelector}[data-idx="${idx}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });

    grid.appendChild(cell);
  });

  container.appendChild(grid);
};

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

let _mediaPanel: HTMLElement | null = null;

const _mediaPanelEl = (): HTMLElement | null => {
  if (!_mediaPanel) _mediaPanel = document.getElementById("media-preview-panel");
  return _mediaPanel;
};

export const syncMediaPreviewPanel = (isMediaType: boolean): void => {
  const panel = _mediaPanelEl();
  if (!panel) return;

  if (isMediaType) {
    if (!panel.isConnected) {
      const sidebarCol = document.getElementById("sidebar-col");
      sidebarCol?.after(panel);
    }
    if (!panel.hasChildNodes()) {
      panel.innerHTML = renderTemplate("degoog-search-media-preview", {}) ?? "";
    }
    return;
  }

  if (panel.isConnected) {
    closeMediaPreview();
    panel.remove();
  }
};

export function closeMediaPreview(): void {
  document.getElementById("media-preview-panel")?.classList.remove("open");
  syncFilters(true);
  document.querySelector(".media-preview-embed")?.remove();
  const img = document.getElementById(
    "media-preview-img",
  ) as HTMLImageElement | null;
  if (img) img.style.display = "";
  document
    .querySelectorAll<HTMLElement>(".image-card, .video-card")
    .forEach((c) => c.classList.remove("selected"));
  currentMediaIdx = -1;
}
