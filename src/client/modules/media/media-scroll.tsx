import { clear, render } from "../../../shared/ui/tribute/dom";
import { LoadingDots } from "../../../shared/ui/components/feedback/loading-dots";
import { state } from "../../state";
import { getBase } from "../../utils/net/base-url";
import { isImageSearchType, type ScoredResult } from "../../../shared/search-types";
import { getEngines } from "../../utils/search/engines";
import { buildSearchBody, buildSearchUrl } from "../../utils/net/url";
import { searchAuthHeaders, appendSearchAuthParams } from "../../utils/net/request";

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
  if (sentinel) render(<LoadingDots />, sentinel);

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
        appendMediaCardsRef(grid, data.results, isImage ? "image" : "video");
      }
    }
  } finally {
    state.mediaLoading = false;
    if (sentinel) clear(sentinel);
  }
}
