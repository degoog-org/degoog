import type { ScoredResult, SearchResponse } from "./search";

export type EngineRecord = Record<string, boolean>;

export interface AppState {
  currentQuery: string;
  currentType: string;
  currentPage: number;
  lastPage: number;
  currentResults: ScoredResult[];
  currentData: SearchResponse | null;
  imagePage: number;
  imageLastPage: number;
  videoPage: number;
  videoLastPage: number;
  currentTimeFilter: string;
  customDateFrom: string;
  customDateTo: string;
  currentLanguage: string;
  mediaLoading: boolean;
  currentBangQuery: string;
  openInNewTab: boolean;
  displayEnginePerformance: boolean;
  displaySearchSuggestions: boolean;
  postMethodEnabled: boolean;
  isInitialLoad: boolean;
}
