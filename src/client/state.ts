import type { AppState } from "./types";

export const state: AppState = {
  currentQuery: "",
  currentType: "all",
  currentPage: 1,
  lastPage: 10,
  currentResults: [],
  currentData: null,
  imagePage: 1,
  imageLastPage: 10,
  videoPage: 1,
  videoLastPage: 10,
  currentTimeFilter: "any",
  currentImageFilters: {
    size: "any",
    color: "any",
    type: "any",
    layout: "any",
    license: "any",
  },
  mediaLoading: false,
  currentBangQuery: "",
  imagePreviewMode: "side",
};
