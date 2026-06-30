import { state } from "../../state";
import { cleanHostname } from "../../utils/dom";
import { openMediaPreview, registerAppendMediaCards } from "../media/media";
import { renderTemplate } from "../../utils/template";
import type { ScoredResult } from "../../types";

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

const _imageCardUrl = (r: ScoredResult): string => {
  const thumbnail = r.thumbnail || "";
  if (!state.inlineGifPlayback || !r.isGif || !r.imageUrl) return thumbnail;
  return r.imageUrl;
};

const _buildMediaContext = (r: ScoredResult): Record<string, unknown> => ({
  title: r.title,
  url: r.url,
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
      card.innerHTML = renderTemplate(templateId, _buildMediaContext(r)) ?? "";
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
