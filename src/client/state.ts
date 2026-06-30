import type { AppState } from "./types";
import type { ImageFilter } from "./types/search";

export const defaultImageFilter = (): ImageFilter => ({});

export const state: AppState = {
  currentQuery: "",
  currentType: "web",
  currentPage: 1,
  lastPage: 10,
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
  isInitialLoad: false,
  imageFilter: defaultImageFilter(),
};
