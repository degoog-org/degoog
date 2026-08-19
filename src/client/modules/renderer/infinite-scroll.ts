import { skeletonMoreResults } from "../../animations/skeleton";
import { state } from "../../state";
import type { ScoredResult, SearchResponse } from "../../types";
import { getBase } from "../../utils/base-url";
import { getEngines, isImageSearchType } from "../../utils/engines";
import { appendSearchAuthParams, searchAuthHeaders } from "../../utils/request";
import { declaredPages } from "../../utils/search-helpers";
import { hasMorePages } from "../../utils/page-flow";
import { buildSearchBody, buildSearchUrl } from "../../utils/url";
import { mergeEngineTimings } from "../../utils/search/engine-stats";
import { appendResults, renderEngineStats } from "./render";

const SENTINEL_CLASS = "degoog-infinite";
const PULL_CLASS = "degoog-infinite__pull";
const SKELETON_CLASS = "degoog-infinite__skeleton";
const PULL_RATIOS = [0, 0.2, 0.4, 0.6, 0.8, 1];
const LOAD_ROOT_MARGIN = "0px 0px 320px";
const SKELETON_COUNT = 3;

let observer: IntersectionObserver | null = null;
let sentinel: HTMLElement | null = null;
let loading = false;
let exhausted = false;

const _sentinelHtml = (): string =>
  `<div class="${SENTINEL_CLASS}"><div class="${PULL_CLASS}"></div></div>`;

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
  sentinel.insertAdjacentHTML(
    "beforeend",
    `<div class="${SKELETON_CLASS}">${skeletonMoreResults(SKELETON_COUNT)}</div>`,
  );
};

const _clearSkeleton = (): void => {
  if (!sentinel) return;
  sentinel.classList.remove(`${SENTINEL_CLASS}--loading`);
  sentinel.querySelector(`.${SKELETON_CLASS}`)?.remove();
};

const _fetchPage = async (page: number): Promise<SearchResponse | null> => {
  const engines = await getEngines();
  const url = buildSearchUrl(state.currentQuery, engines, state.currentType, page);
  const res = state.postMethodEnabled
    ? await fetch(`${getBase()}/api/search`, {
        method: "POST",
        body: JSON.stringify(
          buildSearchBody(state.currentQuery, engines, state.currentType, page),
        ),
        headers: {
          "Content-Type": "application/json",
          ...searchAuthHeaders(),
        },
      })
    : await fetch(appendSearchAuthParams(url));
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
    query: state.currentQuery,
    type: state.currentType,
    page: 1,
    loaded: state.currentPage,
  };
  history.replaceState(historyState, "", `${getBase()}/search?${params.toString()}`);
};

const _applyPage = async (
  page: number,
  showSkeleton: boolean,
): Promise<boolean> => {
  const startIndex = state.currentResults.length;
  if (showSkeleton) _showSkeleton();

  try {
    const data = await _fetchPage(page);
    const results: ScoredResult[] = data?.results ?? [];
    state.currentPage = page;
    if (state.currentData) {
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
    exhausted = true;
    teardownInfinite();
    return false;
  } finally {
    if (showSkeleton) _clearSkeleton();
    _setPull(0);
    _rearm();
  }
};

const _loadNext = async (): Promise<void> => {
  if (loading || !_hasMorePages()) return;
  loading = true;
  try {
    await _applyPage(state.currentPage + 1, true);
  } finally {
    loading = false;
  }
};

export const restoreInfinitePages = async (targetPage: number): Promise<void> => {
  if (loading || targetPage <= state.currentPage) return;
  loading = true;
  try {
    for (let page = state.currentPage + 1; page <= targetPage; page++) {
      if (!_hasMorePages()) break;
      const loadedPage = await _applyPage(page, false);
      if (!loadedPage) break;
    }
  } finally {
    loading = false;
  }
};

export const setupInfinite = (type: string): void => {
  teardownInfinite();
  if (isImageSearchType(type)) return;

  const container = document.getElementById("results-list");
  if (!container || state.currentResults.length === 0) return;
  if (!_hasMorePages()) return;

  container.insertAdjacentHTML("afterend", _sentinelHtml());
  sentinel = document.querySelector<HTMLElement>(`.${SENTINEL_CLASS}`);
  if (!sentinel) return;

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
