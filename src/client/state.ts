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
};
