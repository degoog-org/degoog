import { state } from "../../state";
import { getEngines } from "../../utils/engines";
import { buildSearchUrl, proxyImageUrl } from "../../utils/url";
import { escapeHtml, cleanHostname } from "../../utils/dom";
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

let lightboxScale = 1;
let lightboxX = 0;
let lightboxY = 0;
let activePointerId: number | null = null;
let dragStartX = 0;
let dragStartY = 0;
let pointerOriginX = 0;
let pointerOriginY = 0;
let lightboxCloseTimer: ReturnType<typeof setTimeout> | null = null;

const LIGHTBOX_CLOSE_MS = 180;
const MIN_LIGHTBOX_SCALE = 0.75;
const MAX_LIGHTBOX_SCALE = 6;
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
  if (sentinel) {
    sentinel.innerHTML =
      '<div class="loading-dots"><span></span><span></span><span></span></div>';
  }

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
  options: { forceLightbox?: boolean } = {},
): void {
  currentMediaIdx = idx;
  currentCardSelector = cardSelector;
  _selectCard(idx, cardSelector);

  if (_canUseImageLightbox(item) &&
      (options.forceLightbox || state.imagePreviewMode === "center")) {
    _closeSidePanel();
    _openMediaLightbox(item);
    return;
  }

  _renderSidePreview(item);
}

export function navigateMediaPreview(
  direction: -1 | 1,
  options: { forceLightbox?: boolean } = {},
): void {
  const target = _findColumnTarget(
    currentCardSelector,
    currentMediaIdx,
    direction,
  );
  if (!target) return;

  const newIdx = parseInt(target.dataset.idx ?? "", 10);
  const item = state.currentResults[newIdx];
  if (!item) return;
  const forceLightbox = options.forceLightbox || isMediaLightboxOpen();
  openMediaPreview(item, newIdx, currentCardSelector, { forceLightbox });
  target.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

export function closeMediaPreview(): void {
  closeMediaLightbox({ immediate: true, preserveSelection: false });
  _closeSidePanel();
  _clearCardSelection();
  currentMediaIdx = -1;
}

export function openCurrentMediaLightbox(): void {
  const item = _getCurrentItem();
  if (!item || !_canUseImageLightbox(item)) return;
  _openMediaLightbox(item);
}

export function closeMediaLightbox(
  options: { immediate?: boolean; preserveSelection?: boolean } = {},
): void {
  const lightbox = document.getElementById("media-lightbox");
  if (!lightbox?.classList.contains("open")) {
    if (!options.preserveSelection && !_isSidePanelOpen()) _clearCardSelection();
    return;
  }

  if (lightboxCloseTimer) {
    clearTimeout(lightboxCloseTimer);
    lightboxCloseTimer = null;
  }

  const finish = (): void => {
    lightbox.classList.remove("open", "closing");
    lightbox.setAttribute("aria-hidden", "true");
    _unlockBodyScroll();
    if (!options.preserveSelection && !_isSidePanelOpen()) {
      _clearCardSelection();
    }
  };

  _stopDrag();

  if (options.immediate) {
    finish();
    return;
  }

  lightbox.classList.add("closing");
  lightboxCloseTimer = setTimeout(finish, LIGHTBOX_CLOSE_MS);
}

export function isMediaLightboxOpen(): boolean {
  return (
    document.getElementById("media-lightbox")?.classList.contains("open") ??
    false
  );
}

export function zoomMediaLightbox(delta: number): void {
  const nextScale = Math.min(
    MAX_LIGHTBOX_SCALE,
    Math.max(MIN_LIGHTBOX_SCALE, lightboxScale + delta),
  );
  lightboxScale = nextScale;
  _applyLightboxTransform();
}

export function startMediaLightboxDrag(
  event: PointerEvent,
  target: HTMLElement,
): void {
  if (!isMediaLightboxOpen()) return;
  activePointerId = event.pointerId;
  dragStartX = lightboxX;
  dragStartY = lightboxY;
  pointerOriginX = event.clientX;
  pointerOriginY = event.clientY;
  target.setPointerCapture(event.pointerId);
  target.classList.add("dragging");
}

export function updateMediaLightboxDrag(event: PointerEvent): void {
  if (activePointerId !== event.pointerId) return;
  lightboxX = dragStartX + (event.clientX - pointerOriginX);
  lightboxY = dragStartY + (event.clientY - pointerOriginY);
  _applyLightboxTransform();
}

export function endMediaLightboxDrag(target?: HTMLElement): void {
  _stopDrag();
  target?.classList.remove("dragging");
}

export async function runMediaAction(action: string): Promise<void> {
  const item = _getCurrentItem();
  if (!item) return;

  if (action === "share") {
    await _copyDestinationUrl(item.url);
    return;
  }
  if (action === "download") {
    await _downloadCurrentImage(item);
    return;
  }
  if (action === "open-image") {
    const rawUrl = _getRawImageUrl(item);
    if (rawUrl) window.open(rawUrl, "_blank", "noopener");
  }
}

export function openRelatedMedia(idx: number): void {
  if (!currentCardSelector) return;
  const item = state.currentResults[idx];
  if (!item) return;
  openMediaPreview(item, idx, currentCardSelector, {
    forceLightbox: isMediaLightboxOpen(),
  });
}

function _renderSidePreview(item: ScoredResult): void {
  const panel = document.getElementById("media-preview-panel");
  const img = document.getElementById(
    "media-preview-img",
  ) as HTMLImageElement | null;
  const info = document.getElementById("media-preview-info");

  if (img) {
    img.src = _getPreviewImageUrl(item);
    img.alt = item.title;
  }
  if (info) info.innerHTML = _buildPreviewInfoHtml(item, "panel");

  panel?.classList.add("open");
  _updateNavButtons();
}

function _openMediaLightbox(item: ScoredResult): void {
  const lightbox = document.getElementById("media-lightbox");
  const img = document.getElementById(
    "media-lightbox-img",
  ) as HTMLImageElement | null;
  const info = document.getElementById("media-lightbox-info");
  if (!lightbox || !img || !info) return;

  if (lightboxCloseTimer) {
    clearTimeout(lightboxCloseTimer);
    lightboxCloseTimer = null;
  }

  lightbox.classList.remove("closing");
  lightbox.classList.add("open");
  lightbox.setAttribute("aria-hidden", "false");
  _lockBodyScroll();

  img.src = _getPreviewImageUrl(item);
  img.alt = item.title;
  info.innerHTML = _buildPreviewInfoHtml(item, "lightbox");
  _resetLightboxTransform();
  _updateNavButtons();
}

function _buildPreviewInfoHtml(
  item: ScoredResult,
  variant: "panel" | "lightbox",
): string {
  const dimensions = _buildDimensionsLabel(item);
  const dimensionsHtml = dimensions
    ? `<span class="media-preview-dimensions">${escapeHtml(dimensions)}</span>`
    : "";
  const relatedHtml =
    state.currentType === "images"
      ? _buildRelatedImagesHtml(variant)
      : "";

  const actionsHtml =
    state.currentType === "images"
      ? `
        <div class="media-preview-actions">
          <a class="media-preview-visit" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">Visit page</a>
          <button class="media-action-btn" type="button" data-action="share">Share</button>
          <button class="media-action-btn" type="button" data-action="download">Download</button>
          <div class="media-action-menu-wrap">
            <button class="media-action-btn media-action-btn--icon media-menu-toggle" type="button" aria-label="More actions">⋯</button>
            <div class="media-action-menu">
              <button class="media-action-menu-item" type="button" data-action="open-image">Open image in new tab</button>
              <a class="media-action-menu-item" href="${escapeHtml(_buildGoogleLensUrl(item))}" target="_blank" rel="noreferrer">Reverse search with Google Lens</a>
              <a class="media-action-menu-item" href="${escapeHtml(_buildSauceNaoUrl(item))}" target="_blank" rel="noreferrer">Reverse search with SauceNAO</a>
            </div>
          </div>
        </div>
      `
      : `<a class="media-preview-visit" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">Visit page</a>`;

  return `
    <div class="media-preview-copy">
      <h3 class="media-preview-title">${escapeHtml(item.title)}</h3>
      <a class="media-preview-link" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(cleanHostname(item.url))}</a>
      <div class="media-preview-meta">
        ${dimensionsHtml}
        ${item.snippet ? `<span class="media-preview-site">${escapeHtml(item.snippet)}</span>` : ""}
      </div>
      ${actionsHtml}
    </div>
    ${relatedHtml}
  `;
}

function _buildRelatedImagesHtml(variant: "panel" | "lightbox"): string {
  const related = _getRelatedImages();
  if (related.length === 0) return "";

  return `
    <div class="media-related media-related--${variant}">
      <div class="media-related-heading">More relevant images</div>
      <div class="media-related-grid">
        ${related
          .map(
            ({ item, idx }) => `
              <button
                class="media-related-card"
                type="button"
                data-related-idx="${idx}"
              >
                <img
                  class="media-related-thumb"
                  src="${escapeHtml(proxyImageUrl(item.thumbnail || item.imageUrl || ""))}"
                  alt="${escapeHtml(item.title)}"
                  loading="lazy"
                />
                <span class="media-related-label">${escapeHtml(cleanHostname(item.url))}</span>
              </button>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function _getRelatedImages(): Array<{ item: ScoredResult; idx: number }> {
  const related: Array<{ item: ScoredResult; idx: number }> = [];
  if (state.currentType !== "images" || currentMediaIdx < 0) return related;

  for (let offset = 1; related.length < 8; offset++) {
    const beforeIdx = currentMediaIdx - offset;
    const afterIdx = currentMediaIdx + offset;

    if (beforeIdx >= 0) {
      const item = state.currentResults[beforeIdx];
      if (item?.thumbnail || item?.imageUrl) {
        related.push({ item, idx: beforeIdx });
      }
    }
    if (related.length >= 8) break;
    if (afterIdx < state.currentResults.length) {
      const item = state.currentResults[afterIdx];
      if (item?.thumbnail || item?.imageUrl) {
        related.push({ item, idx: afterIdx });
      }
    }
    if (beforeIdx < 0 && afterIdx >= state.currentResults.length) break;
  }

  return related;
}

function _buildGoogleLensUrl(item: ScoredResult): string {
  return `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(_getRawImageUrl(item))}`;
}

function _buildSauceNaoUrl(item: ScoredResult): string {
  return `https://saucenao.com/search.php?url=${encodeURIComponent(_getRawImageUrl(item))}`;
}

function _buildDimensionsLabel(item: ScoredResult): string {
  if (item.imageWidth && item.imageHeight) {
    return `${item.imageWidth} x ${item.imageHeight}`;
  }
  return "";
}

function _getPreviewImageUrl(item: ScoredResult): string {
  return proxyImageUrl(_getRawImageUrl(item)) || "";
}

function _getRawImageUrl(item: ScoredResult): string {
  return item.imageUrl || item.thumbnail || "";
}

function _getCurrentItem(): ScoredResult | null {
  if (currentMediaIdx < 0) return null;
  return state.currentResults[currentMediaIdx] ?? null;
}

function _canUseImageLightbox(item: ScoredResult): boolean {
  return state.currentType === "images" && !!_getRawImageUrl(item);
}

function _selectCard(idx: number, selector: string): void {
  document
    .querySelectorAll<HTMLElement>(selector)
    .forEach((c) => c.classList.remove("selected"));
  document
    .querySelector<HTMLElement>(`${selector}[data-idx="${idx}"]`)
    ?.classList.add("selected");
}

function _clearCardSelection(): void {
  document
    .querySelectorAll<HTMLElement>(".image-card, .video-card")
    .forEach((c) => c.classList.remove("selected"));
}

function _updateNavButtons(): void {
  const prevDisabled = !_findColumnTarget(
    currentCardSelector,
    currentMediaIdx,
    -1,
  );
  const nextDisabled = !_findColumnTarget(
    currentCardSelector,
    currentMediaIdx,
    1,
  );

  const prevBtn = document.getElementById("media-preview-prev");
  const nextBtn = document.getElementById("media-preview-next");
  if (prevBtn) (prevBtn as HTMLButtonElement).disabled = prevDisabled;
  if (nextBtn) (nextBtn as HTMLButtonElement).disabled = nextDisabled;

  const lightboxPrev = document.getElementById("media-lightbox-prev");
  const lightboxNext = document.getElementById("media-lightbox-next");
  if (lightboxPrev) {
    (lightboxPrev as HTMLButtonElement).disabled = prevDisabled;
  }
  if (lightboxNext) {
    (lightboxNext as HTMLButtonElement).disabled = nextDisabled;
  }
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

function _closeSidePanel(): void {
  document.getElementById("media-preview-panel")?.classList.remove("open");
}

function _isSidePanelOpen(): boolean {
  return (
    document.getElementById("media-preview-panel")?.classList.contains("open") ??
    false
  );
}

function _applyLightboxTransform(): void {
  const img = document.getElementById("media-lightbox-img");
  if (!img) return;
  (img as HTMLElement).style.transform =
    `translate(-50%, -50%) translate(${lightboxX}px, ${lightboxY}px) scale(${lightboxScale})`;
}

function _resetLightboxTransform(): void {
  lightboxScale = 1;
  lightboxX = 0;
  lightboxY = 0;
  _applyLightboxTransform();
}

function _stopDrag(): void {
  activePointerId = null;
  document
    .getElementById("media-lightbox-stage")
    ?.classList.remove("dragging");
}

function _lockBodyScroll(): void {
  if (!document.body.dataset.prevOverflow) {
    document.body.dataset.prevOverflow = document.body.style.overflow || "";
  }
  document.body.style.overflow = "hidden";
}

function _unlockBodyScroll(): void {
  document.body.style.overflow = document.body.dataset.prevOverflow || "";
  delete document.body.dataset.prevOverflow;
}

async function _copyDestinationUrl(url: string): Promise<void> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
      return;
    }
  } catch {}

  const el = document.createElement("textarea");
  el.value = url;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.left = "-9999px";
  document.body.appendChild(el);
  el.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(el);
  }
}

async function _downloadCurrentImage(item: ScoredResult): Promise<void> {
  const rawUrl = _getRawImageUrl(item);
  if (!rawUrl) return;
  const response = await fetch(proxyImageUrl(rawUrl));
  if (!response.ok) return;

  const blob = await response.blob();
  const fileName = _resolveDownloadFileName(item, response.headers.get("content-type"));
  const pickerHost = window as Window & {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<{
      createWritable: () => Promise<{
        write: (data: Blob) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  };

  if (pickerHost.showSaveFilePicker) {
    try {
      const handle = await pickerHost.showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: "Image",
            accept: {
              [blob.type || "image/*"]: [
                `.${fileName.split(".").pop() ?? "jpg"}`,
              ],
            },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch {
      // Fall back to browser download when picker is unavailable or canceled.
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

function _resolveDownloadFileName(
  item: ScoredResult,
  contentType: string | null,
): string {
  const fromUrl = _getRawImageUrl(item).split("?")[0].split("#")[0];
  const extFromUrl = fromUrl.includes(".")
    ? `.${fromUrl.split(".").pop() ?? "jpg"}`
    : "";
  const extFromType = contentType?.includes("/")
    ? `.${contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg"}`
    : ".jpg";
  const safeTitle = item.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const base = safeTitle || "degoog-image";
  return `${base}${extFromUrl || extFromType}`;
}
