import type { AppState } from "./types/state";
import type { ImageFilter } from "./types/search";

export const defaultImageFilter = (): ImageFilter => ({});

export const state: AppState = {
  currentQuery: "",
  currentType: "web",
  currentPage: 1,
  restoreInfinitePage: 1,
  lastPage: null,
  currentResults: [],
  currentData: null,
  currentRelatedSearches: [],
  imagePage: 1,
  imageLastPage: 10,
  videoPage: 1,
  videoLastPage: 10,
  currentTimeFilter: "any",
  customDateFrom: "",
  customDateTo: "",
  currentLanguage: "",
  currentRegion: "",
  mediaLoading: false,
  currentBangQuery: "",
  openInNewTab: false,
  displayEnginePerformance: true,
  displaySearchSuggestions: true,
  postMethodEnabled: false,
  inlineGifPlayback: true,
  stickySidebar: false,
  hideUrlParams: false,
  showResultDates: true,
  isInitialLoad: false,
  imageFilter: defaultImageFilter(),
  searchSeq: 0,
  settledSeq: 0,
};

export const beginSearch = (): number => ++state.searchSeq;

export const settleSearch = (seq: number): boolean => {
  if (seq !== state.searchSeq || state.settledSeq === seq) return false;
  state.settledSeq = seq;
  return true;
};

export const isCurrentSearch = (seq: number): boolean => seq === state.searchSeq;

export const takeRestoreInfinitePage = (): number => {
  const page = state.restoreInfinitePage;
  state.restoreInfinitePage = 1;
  return page;
};
