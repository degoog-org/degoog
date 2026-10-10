import { render } from "../../../../shared/ui/tribute/dom";
import { InfiniteSentinel } from "./infinite-sentinel";
import { InfiniteSkeleton } from "./infinite-skeleton";
import { SENTINEL_CLASS, SKELETON_CLASS } from "./infinite-scroll-classes";
import { SkeletonMoreResults } from "../../../animations/skeleton/skeleton-more-results";
import { isCurrentSearch, state } from "../../../state";
import { getBase } from "../../../utils/net/base-url";
import {
  isImageSearchType,
  type ScoredResult,
  type SearchResponse,
} from "../../../../shared/search-types";
import { declaredPages } from "../../../utils/search/search-helpers";
import { hasMorePages } from "../../../utils/pagination/page-flow";
import { fetchResultsPage } from "../../../utils/net/url";
import { mergeEngineTimings } from "../../../utils/search/engine-stats/engine-stats";
import { renderEngineStats } from "../sidebar/render-sidebar";
import { appendResults } from "../render";

const PULL_RATIOS = [0, 0.2, 0.4, 0.6, 0.8, 1];
const LOAD_ROOT_MARGIN = "0px 0px 320px";
const SKELETON_COUNT = 3;

let observer: IntersectionObserver | null = null;
let sentinel: HTMLElement | null = null;
let loading = false;
let exhausted = false;

const _detached = (node: JSX.Element): Element | null => {
  const wrapper = document.createElement("div");
  render(node, wrapper);
  return wrapper.firstElementChild;
};

const _hasMorePages = (): boolean =>
  hasMorePages(state.currentPage, state.lastPage, exhausted);

export const teardownInfinite = (): void => {
  observer?.disconnect();
  observer = null;
  sentinel?.remove();
  sentinel = null;
  loading = false;
  exhausted = false;
};

const _setPull = (ratio: number): void => {
  sentinel?.style.setProperty("--degoog-pull", ratio.toFixed(3));
};

const _rearm = (): void => {
  if (!observer || !sentinel) return;
  observer.unobserve(sentinel);
  observer.observe(sentinel);
};

const _showSkeleton = (): void => {
  if (!sentinel) return;
  sentinel.classList.add(`${SENTINEL_CLASS}--loading`);
  const skeleton = _detached(
    <InfiniteSkeleton>
      <SkeletonMoreResults count={SKELETON_COUNT} />
    </InfiniteSkeleton>,
  );
  if (skeleton) sentinel.appendChild(skeleton);
};

const _clearSkeleton = (): void => {
  if (!sentinel) return;
  sentinel.classList.remove(`${SENTINEL_CLASS}--loading`);
  sentinel.querySelector(`.${SKELETON_CLASS}`)?.remove();
};

const _fetchPage = async (page: number): Promise<SearchResponse | null> => {
  const res = await fetchResultsPage(state.currentType, page);
  if (!res.ok) return null;
  return (await res.json()) as SearchResponse;
};

const _syncHistory = (): void => {
  if (state.postMethodEnabled) return;
  const params = new URLSearchParams(window.location.search);
  if (!params.get("q")) return;
  if (state.currentPage > 1) params.set("loaded", String(state.currentPage));
  else params.delete("loaded");
  const historyState = {
    ...(window.history.state ?? {}),
    degoog: true,
    query: state.currentBangQuery || state.currentQuery,
    type: state.currentType,
    page: 1,
    loaded: state.currentPage,
  };
  history.replaceState(
    historyState,
    "",
    `${getBase()}/search?${params.toString()}`,
  );
};

const _applyPage = async (
  page: number,
  showSkeleton: boolean,
): Promise<boolean> => {
  const seq = state.searchSeq;
  const startIndex = state.currentResults.length;
  if (showSkeleton) _showSkeleton();

  try {
    const data = await _fetchPage(page);
    if (!isCurrentSearch(seq)) return false;
    const results: ScoredResult[] = data?.results ?? [];
    state.currentPage = page;
    if (state.currentData?.engineTimings) {
      state.currentData.engineTimings = mergeEngineTimings(
        state.currentData.engineTimings,
        data?.engineTimings ?? [],
        page,
      );
      renderEngineStats(state.currentData.engineTimings, () => undefined);
    }
    if (results.length === 0) {
      exhausted = true;
      teardownInfinite();
      return false;
    }
    state.currentResults = state.currentResults.concat(results);
    if (state.currentData) state.currentData.results = state.currentResults;

    const declared = declaredPages(data?.totalPages);
    if (declared !== null) state.lastPage = Math.max(declared, page);

    appendResults(results, startIndex);
    _syncHistory();
    if (!_hasMorePages()) teardownInfinite();
    return true;
  } catch (err) {
    console.warn("[infinite-scroll] next page failed", err);
    if (!isCurrentSearch(seq)) return false;
    exhausted = true;
    teardownInfinite();
    return false;
  } finally {
    if (isCurrentSearch(seq)) {
      if (showSkeleton) _clearSkeleton();
      _setPull(0);
      _rearm();
    }
  }
};

const _loadNext = async (): Promise<void> => {
  if (loading || !_hasMorePages()) return;
  const seq = state.searchSeq;
  loading = true;
  try {
    await _applyPage(state.currentPage + 1, true);
  } finally {
    if (isCurrentSearch(seq)) loading = false;
  }
};

export const restoreInfinitePages = async (
  targetPage: number,
): Promise<void> => {
  if (loading || targetPage <= state.currentPage) return;
  const seq = state.searchSeq;
  loading = true;
  try {
    for (let page = state.currentPage + 1; page <= targetPage; page++) {
      if (!_hasMorePages()) break;
      const loadedPage = await _applyPage(page, false);
      if (!loadedPage) break;
    }
  } finally {
    if (isCurrentSearch(seq)) loading = false;
  }
};

export const setupInfinite = (type: string): void => {
  teardownInfinite();
  if (isImageSearchType(type)) return;

  const container = document.getElementById("results-list");
  if (!container || state.currentResults.length === 0) return;
  if (!_hasMorePages()) return;

  const sentinelEl = _detached(<InfiniteSentinel />);
  if (!sentinelEl) return;
  container.after(sentinelEl);
  sentinel = sentinelEl as HTMLElement;

  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (!entry) return;
      _setPull(entry.intersectionRatio);
      if (entry.isIntersecting && !loading) void _loadNext();
    },
    { rootMargin: LOAD_ROOT_MARGIN, threshold: PULL_RATIOS },
  );
  observer.observe(sentinel);
};

export const armInfinite = (type: string, restorePage: number): void => {
  setupInfinite(type);
  if (restorePage > 1) void restoreInfinitePages(restorePage);
};
