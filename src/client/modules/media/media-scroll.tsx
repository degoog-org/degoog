import { clear, render } from "../../../shared/ui/tribute/dom";
import { LoadingDots } from "../../../shared/ui/components/feedback/loading-dots";
import { isCurrentSearch, state } from "../../state";
import { isImageSearchType, type ScoredResult } from "../../../shared/search-types";
import { fetchResultsPage } from "../../utils/net/url";
import { RESULTS_READY } from "../renderer/media/result-ranking";

let mediaObserver: IntersectionObserver | null = null;
let appendMediaCardsRef:
  | ((
      grid: HTMLElement,
      results: ScoredResult[],
      type: "image" | "video",
    ) => void)
  | null = null;

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

const _rearmMediaObserver = (): void => {
  const sentinel = document.querySelector<HTMLElement>(
    ".media-scroll-sentinel",
  );
  if (!mediaObserver || !sentinel) return;
  mediaObserver.unobserve(sentinel);
  mediaObserver.observe(sentinel);
};

export async function loadMoreMedia(type: string): Promise<void> {
  const isImage = isImageSearchType(type);
  const page = isImage ? state.imagePage : state.videoPage;
  const lastPg = isImage ? state.imageLastPage : state.videoLastPage;
  const nextPage = page + 1;
  if (nextPage > lastPg || state.mediaLoading) return;

  state.mediaLoading = true;
  const seq = state.searchSeq;
  const sentinel = document.querySelector<HTMLElement>(
    ".media-scroll-sentinel",
  );
  if (sentinel) render(<LoadingDots />, sentinel);

  let appended = false;
  try {
    const res = await fetchResultsPage(type, nextPage);
    if (!isCurrentSearch(seq)) return;
    if (!res.ok) {
      console.warn("[media-scroll] next page failed", res.status);
      return;
    }

    const raw = (await res.json()) as {
      results?: ScoredResult[];
      type?: string;
    };
    if (!isCurrentSearch(seq)) return;
    const fetched = raw.results ?? [];
    const seen = new Set(state.currentResults.map((r) => r.url));
    const data = { results: fetched.filter((r) => !seen.has(r.url)) };
    if (fetched.length === 0) {
      if (isImage) state.imageLastPage = page;
      else state.videoLastPage = page;
    } else if (data.results.length === 0) {
      if (isImage) state.imagePage = nextPage;
      else state.videoPage = nextPage;
    } else {
      state.currentResults = state.currentResults.concat(data.results);
      if (isImage) state.imagePage = nextPage;
      else state.videoPage = nextPage;

      const container = document.getElementById("results-list");
      const grid = container?.querySelector<HTMLElement>(
        isImage ? ".image-grid" : ".video-grid",
      );
      if (grid && appendMediaCardsRef) {
        appendMediaCardsRef(grid, data.results, isImage ? "image" : "video");
      }
      appended = true;
      window.dispatchEvent(new CustomEvent(RESULTS_READY));
    }
  } catch (err) {
    console.warn("[media-scroll] next page failed", err);
  } finally {
    state.mediaLoading = false;
    if (sentinel) clear(sentinel);
    if (appended || !isCurrentSearch(seq)) _rearmMediaObserver();
  }
}
