import { state } from "../../state";
import { getEngines } from "../../utils/engines";
import { buildSearchUrl, proxyImageUrl } from "../../utils/url";
import { escapeHtml, cleanHostname } from "../../utils/dom";
import { getVideoEmbedUrl } from "../../utils/video-embed";
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
let lightboxDidDrag = false;
let lightboxSuppressStageClickUntil = 0;
let lightboxImageRequestToken = 0;

const LIGHTBOX_CLOSE_MS = 180;
const LIGHTBOX_DRAG_THRESHOLD = 6;
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

  if (
    _canUseLightbox(item) &&
    (options.forceLightbox || state.imagePreviewMode === "center")
  ) {
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
  if (!item || !_canUseLightbox(item)) return;
  _openMediaLightbox(item);
}

export function closeMediaLightbox(
  options: { immediate?: boolean; preserveSelection?: boolean } = {},
): void {
  const lightbox = document.getElementById("media-lightbox");
  const stage = document.getElementById("media-lightbox-stage");
  const img = document.getElementById(
    "media-lightbox-img",
  ) as HTMLImageElement | null;
  const video = document.getElementById(
    "media-lightbox-video",
  ) as HTMLIFrameElement | null;
  if (!lightbox?.classList.contains("open")) {
    if (!options.preserveSelection && !_isSidePanelOpen()) _clearCardSelection();
    return;
  }

  if (lightboxCloseTimer) {
    clearTimeout(lightboxCloseTimer);
    lightboxCloseTimer = null;
  }

  const finish = (): void => {
    lightboxImageRequestToken += 1;
    lightbox.classList.remove("open", "closing", "media-lightbox--video");
    lightbox.setAttribute("aria-hidden", "true");
    stage?.classList.remove("is-loading");
    img?.classList.remove("is-loading");
    if (img) {
      img.hidden = false;
      img.removeAttribute("src");
    }
    if (video) {
      video.hidden = true;
      video.src = "";
    }
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
  if (!_isImageLightboxOpen()) return;
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
  lightboxDidDrag = false;
  target.setPointerCapture(event.pointerId);
  target.classList.add("dragging");
}

export function updateMediaLightboxDrag(event: PointerEvent): void {
  if (activePointerId !== event.pointerId) return;
  if (
    !lightboxDidDrag &&
    Math.hypot(event.clientX - pointerOriginX, event.clientY - pointerOriginY) >=
      LIGHTBOX_DRAG_THRESHOLD
  ) {
    lightboxDidDrag = true;
  }
  lightboxX = dragStartX + (event.clientX - pointerOriginX);
  lightboxY = dragStartY + (event.clientY - pointerOriginY);
  _applyLightboxTransform();
}

export function endMediaLightboxDrag(target?: HTMLElement): void {
  if (lightboxDidDrag) {
    lightboxSuppressStageClickUntil = Date.now() + 220;
  }
  _stopDrag();
  target?.classList.remove("dragging");
}

export function shouldSuppressMediaLightboxStageClick(): boolean {
  if (lightboxSuppressStageClickUntil <= Date.now()) return false;
  lightboxSuppressStageClickUntil = 0;
  return true;
}

export async function runMediaAction(
  action: string,
  trigger?: HTMLElement,
): Promise<void> {
  const item = _getCurrentItem();
  if (!item) return;

  if (action === "big-screen") {
    if (_canUseLightbox(item)) {
      _closeSidePanel();
      _openMediaLightbox(item);
    }
    return;
  }
  if (action === "share") {
    await _copyDestinationUrl(item.url);
    _flashCopiedState(trigger);
    return;
  }
  if (action === "download") {
    await _downloadCurrentImage(item);
    return;
  }
  if (action === "open-image") {
    const rawUrl = _getRawImageUrl(item);
    if (rawUrl) window.open(rawUrl, "_blank", "noopener");
    return;
  }
  if (action === "open-video") {
    window.open(item.url, "_blank", "noopener");
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
  const video = document.getElementById(
    "media-preview-video",
  ) as HTMLIFrameElement | null;
  const info = document.getElementById("media-preview-info");
  const videoEmbedUrl = _getVideoEmbedPreviewUrl(item);

  if (img) {
    img.hidden = !!videoEmbedUrl;
    if (videoEmbedUrl) {
      img.removeAttribute("src");
    } else {
      img.src = _getPreviewImageUrl(item);
      img.alt = item.title;
    }
  }
  if (video) {
    video.hidden = !videoEmbedUrl;
    video.src = videoEmbedUrl;
    video.title = item.title;
  }
  if (info) info.innerHTML = _buildPreviewInfoHtml(item, "panel");

  panel?.classList.toggle("media-preview-panel--video", !!videoEmbedUrl);
  panel?.classList.add("open");
  _updateNavButtons();
}

function _openMediaLightbox(item: ScoredResult): void {
  const lightbox = document.getElementById("media-lightbox");
  const stage = document.getElementById("media-lightbox-stage");
  const img = document.getElementById(
    "media-lightbox-img",
  ) as HTMLImageElement | null;
  const video = document.getElementById(
    "media-lightbox-video",
  ) as HTMLIFrameElement | null;
  const info = document.getElementById("media-lightbox-info");
  if (!lightbox || !stage || !img || !video || !info) return;

  if (lightboxCloseTimer) {
    clearTimeout(lightboxCloseTimer);
    lightboxCloseTimer = null;
  }

  lightbox.classList.remove("closing");
  lightbox.classList.add("open");
  lightbox.setAttribute("aria-hidden", "false");
  _lockBodyScroll();

  info.innerHTML = _buildPreviewInfoHtml(item, "lightbox");
  _updateNavButtons();

  const videoEmbedUrl = _getVideoEmbedLightboxUrl(item);
  if (videoEmbedUrl) {
    lightbox.classList.add("media-lightbox--video");
    stage.classList.remove("is-loading");
    img.classList.remove("is-loading");
    img.hidden = true;
    img.removeAttribute("src");
    video.hidden = false;
    video.src = videoEmbedUrl;
    video.title = item.title;
    _resetLightboxTransform();
    return;
  }

  lightbox.classList.remove("media-lightbox--video");
  video.hidden = true;
  video.src = "";
  img.hidden = false;
  img.alt = item.title;
  _resetLightboxTransform();

  const previewUrl = _getPreviewImageUrl(item);
  const requestToken = ++lightboxImageRequestToken;

  stage.classList.add("is-loading");
  img.classList.add("is-loading");
  img.removeAttribute("src");

  const preloader = new Image();
  preloader.decoding = "async";
  const applyImage = (): void => {
    if (requestToken !== lightboxImageRequestToken) return;
    img.src = previewUrl;
    img.alt = item.title;
    img.classList.remove("is-loading");
    stage.classList.remove("is-loading");
    _resetLightboxTransform();
  };

  preloader.addEventListener("load", applyImage, { once: true });
  preloader.addEventListener("error", applyImage, { once: true });
  preloader.src = previewUrl;
}

function _buildPreviewInfoHtml(
  item: ScoredResult,
  variant: "panel" | "lightbox",
): string {
  const dimensions = _buildDimensionsLabel(item);
  const dimensionsHtml = dimensions
    ? `<span class="media-preview-dimensions">${escapeHtml(dimensions)}</span>`
    : "";
  const durationHtml =
    item.duration && _isVideoResult()
      ? `<span class="media-preview-dimensions">${escapeHtml(item.duration)}</span>`
      : "";
  const relatedHtml =
    _isImageResult() || _isVideoResult() ? _buildRelatedMediaHtml(variant) : "";

  const actionsHtml =
    _isImageResult()
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
      : _isVideoResult()
        ? `
        <div class="media-preview-actions">
          <a class="media-preview-visit" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">Visit page</a>
          <button class="media-action-btn" type="button" data-action="share">Share</button>
          ${
            variant === "panel" && _canUseVideoLightbox(item)
              ? '<button class="media-action-btn" type="button" data-action="big-screen">Big screen</button>'
              : ""
          }
          <div class="media-action-menu-wrap">
            <button class="media-action-btn media-action-btn--icon media-menu-toggle" type="button" aria-label="More actions">⋯</button>
            <div class="media-action-menu">
              <button class="media-action-menu-item" type="button" data-action="open-video">Open video in new tab</button>
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
        ${durationHtml}
        ${item.snippet ? `<span class="media-preview-site">${escapeHtml(item.snippet)}</span>` : ""}
      </div>
      ${actionsHtml}
    </div>
    ${relatedHtml}
  `;
}

function _buildRelatedMediaHtml(variant: "panel" | "lightbox"): string {
  const related = _getRelatedMedia();
  if (related.length === 0) return "";
  const heading = _isVideoResult() ? "More videos" : "More relevant images";

  return `
    <div class="media-related media-related--${variant}">
      <div class="media-related-heading">${heading}</div>
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

function _getRelatedMedia(): Array<{ item: ScoredResult; idx: number }> {
  const related: Array<{ item: ScoredResult; idx: number }> = [];
  if (
    (state.currentType !== "images" && state.currentType !== "videos") ||
    currentMediaIdx < 0
  ) {
    return related;
  }

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
  const rawUrl = _isImageResult() ? _getRawImageUrl(item) : item.thumbnail || "";
  return proxyImageUrl(rawUrl) || "";
}

function _getRawImageUrl(item: ScoredResult): string {
  return item.imageUrl || item.thumbnail || "";
}

function _getCurrentItem(): ScoredResult | null {
  if (currentMediaIdx < 0) return null;
  return state.currentResults[currentMediaIdx] ?? null;
}

function _getVideoEmbedPreviewUrl(item: ScoredResult): string {
  const embedUrl = _getResolvedVideoEmbedUrl(item);
  return embedUrl ? _appendEmbedParams(embedUrl, "rel=0") : "";
}

function _getVideoEmbedLightboxUrl(item: ScoredResult): string {
  const embedUrl = _getResolvedVideoEmbedUrl(item);
  return embedUrl ? _appendEmbedParams(embedUrl, "autoplay=1&rel=0") : "";
}

function _appendEmbedParams(url: string, params: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}${params}`;
}

function _getResolvedVideoEmbedUrl(item: ScoredResult): string | null {
  if (!_isVideoResult()) return null;
  return getVideoEmbedUrl(item.url);
}

function _canUseImageLightbox(item: ScoredResult): boolean {
  return _isImageResult() && !!_getRawImageUrl(item);
}

function _canUseVideoLightbox(item: ScoredResult): boolean {
  return _isVideoResult() && !!_getResolvedVideoEmbedUrl(item);
}

function _canUseLightbox(item: ScoredResult): boolean {
  return _canUseImageLightbox(item) || _canUseVideoLightbox(item);
}

function _isImageResult(): boolean {
  return state.currentType === "images";
}

function _isVideoResult(): boolean {
  return state.currentType === "videos";
}

function _isImageLightboxOpen(): boolean {
  const lightbox = document.getElementById("media-lightbox");
  return !lightbox?.classList.contains("media-lightbox--video");
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
  const video = document.getElementById(
    "media-preview-video",
  ) as HTMLIFrameElement | null;
  if (video) {
    video.hidden = true;
    video.src = "";
  }
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
  lightboxDidDrag = false;
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

function _flashCopiedState(trigger?: HTMLElement): void {
  if (!trigger || !(trigger instanceof HTMLButtonElement)) return;
  if (trigger.dataset.copyTimer) {
    window.clearTimeout(Number(trigger.dataset.copyTimer));
  }

  const previousLabel = trigger.dataset.copyLabel || trigger.textContent || "Share";
  trigger.dataset.copyLabel = previousLabel;
  trigger.textContent = "Copied";
  trigger.classList.add("is-copied");

  const timer = window.setTimeout(() => {
    trigger.textContent = previousLabel;
    trigger.classList.remove("is-copied");
    delete trigger.dataset.copyTimer;
  }, 1400);

  trigger.dataset.copyTimer = String(timer);
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
