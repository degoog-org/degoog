import { clear, render } from "../../../shared/ui/tribute/dom";
import { MediaPreviewActions } from "./media-preview-actions";
import { MediaPreviewInfo } from "./media-preview-info";
import { state } from "../../state";
import type { ScoredResult } from "../../../shared/search-types";
import { cleanHostname } from "../../../shared/utils/url";
import { openLightbox, dropLbOverlay } from "./lightbox";
import { renderTemplate } from "../../utils/dom/template";
import {
  openOverlay,
  closeOverlay,
  discardOverlay,
} from "../../utils/navigation/overlay-history";
import { findColumnTarget, pickOtherMedia } from "./media-grid-nav";
import { setPreviewSource } from "./media-preview-source";

const MORE_IMAGES_COUNT = 15;
export const MEDIA_PREVIEW_OVERLAY = "media-preview";

export enum MediaPreviewCloseMode {
  User = "user",
  HistoryPop = "historyPop",
  Reset = "reset",
}

let currentMediaIdx = -1;
let currentCardSelector = "";
let imageGridPanelSyncRef: ((isOpen: boolean) => void) | null = null;

export function registerImageGridPanelSync(
  fn: (isOpen: boolean) => void,
): void {
  imageGridPanelSyncRef = fn;
}

const syncFilters = (open: boolean): void => {
  void import("../filters/image-filters").then((m) => {
    if (open) m.syncImgFilters(state.currentType);
    else m.toggleImgSidebar(false);
  });
};

export function toggleMediaPreview(
  item: ScoredResult,
  idx: number,
  cardSelector: string,
): void {
  const isOpen = document
    .getElementById("media-preview-panel")
    ?.classList.contains("open");

  if (
    isOpen &&
    currentMediaIdx === idx &&
    currentCardSelector === cardSelector
  ) {
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
  const wasOpen = panel?.classList.contains("open") ?? false;

  currentMediaIdx = idx;
  currentCardSelector = cardSelector;

  setPreviewSource(item);

  const isVideo = cardSelector === ".video-card";
  const previewSrc = item.imageUrl || item.thumbnail || "";

  const imgWrap = document.querySelector<HTMLElement>(
    ".media-preview-img-wrap",
  );
  imgWrap?.querySelector(".media-preview-embed")?.remove();

  if (img) {
    const fallbackSrc =
      previewSrc === item.thumbnail
        ? item.imageUrl || ""
        : item.thumbnail || "";
    img.dataset.triedFallback = "";
    img.style.display = "";
    img.src = previewSrc || "";
    img.style.cursor = "zoom-in";
    img.onclick = () => {
      const src = img.src;
      if (src) openLightbox(src);
    };
    img.onerror = () => {
      if (
        !img.dataset.triedFallback &&
        fallbackSrc &&
        fallbackSrc !== img.src
      ) {
        img.dataset.triedFallback = "1";
        img.src = fallbackSrc;
      } else {
        img.style.display = "none";
      }
    };
  }

  if (info) {
    const downloadUrl = isVideo ? "" : previewSrc || "";
    const downloadFilename = (() => {
      try {
        const p = new URL(previewSrc).pathname;
        return p.split("/").filter(Boolean).pop() || "image";
      } catch {
        return "image";
      }
    })();
    render(
      <MediaPreviewInfo
        title={item.title}
        url={item.url}
        hostname={cleanHostname(item.url)}
        newTab={state.openInNewTab}
        sources={item.sources}
        actions={
          <MediaPreviewActions
            url={item.url}
            newTab={state.openInNewTab}
            isVideo={isVideo}
            downloadUrl={downloadUrl}
            downloadFilename={downloadFilename}
          />
        }
      />,
      info,
    );
  }

  _renderMoreMedia(idx, cardSelector);

  document
    .querySelectorAll<HTMLElement>(cardSelector)
    .forEach((c) => c.classList.remove("selected"));
  document
    .querySelector<HTMLElement>(`${cardSelector}[data-idx="${idx}"]`)
    ?.classList.add("selected");

  panel?.classList.add("open");
  if (!isVideo) imageGridPanelSyncRef?.(true);
  syncFilters(false);

  if (!wasOpen) {
    openOverlay(MEDIA_PREVIEW_OVERLAY, () =>
      closeMediaPreview(MediaPreviewCloseMode.HistoryPop),
    );
  }

  _updateNavButtons();
}

const _renderMoreMedia = (excludeIdx: number, cardSelector: string): void => {
  const container = document.getElementById("media-preview-more");
  if (!container) return;

  const picks = pickOtherMedia(excludeIdx, MORE_IMAGES_COUNT, cardSelector);
  clear(container);
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
      if (
        !thumb.dataset.triedFallback &&
        r.imageUrl &&
        r.imageUrl !== thumb.src
      ) {
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
    (prevBtn as HTMLButtonElement).disabled = !findColumnTarget(
      currentCardSelector,
      currentMediaIdx,
      -1,
    );
  if (nextBtn)
    (nextBtn as HTMLButtonElement).disabled = !findColumnTarget(
      currentCardSelector,
      currentMediaIdx,
      1,
    );
}

export function navigateMediaPreview(direction: -1 | 1): void {
  const target = findColumnTarget(
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
  if (!_mediaPanel)
    _mediaPanel = document.getElementById("media-preview-panel");
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
    closeMediaPreview(MediaPreviewCloseMode.Reset);
    panel.remove();
  }
};

export function closeMediaPreview(
  mode: MediaPreviewCloseMode = MediaPreviewCloseMode.User,
): void {
  const panel = document.getElementById("media-preview-panel");
  const wasOpen = panel?.classList.contains("open") ?? false;

  panel?.classList.remove("open");
  if (currentCardSelector !== ".video-card") imageGridPanelSyncRef?.(false);
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

  if (!wasOpen) return;

  if (mode === MediaPreviewCloseMode.Reset) {
    discardOverlay(MEDIA_PREVIEW_OVERLAY);
    dropLbOverlay();
  } else if (mode === MediaPreviewCloseMode.User) {
    closeOverlay(MEDIA_PREVIEW_OVERLAY);
  }
}
