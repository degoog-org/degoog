import type { SlotPanelResult } from "./extension";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  thumbnail?: string;
  imageUrl?: string;
  duration?: string;
}

export interface SearchBody {
  query: string;
  engines: string[];
  type?: string;
  page?: number;
  time?: string;
  dateFrom?: string;
  dateTo?: string;
  lang?: string;
}

export interface RetryPostBody extends SearchBody {
  engine: string;
}

export interface SuggestPostBody {
  query: string;
}

export interface SearchParams {
  query: string;
  engines: EngineConfig;
  searchType: SearchType;
  page: number;
  timeFilter: TimeFilter;
  lang: string;
  dateFrom: string;
  dateTo: string;
}

export interface ScoredResult extends SearchResult {
  score: number;
  sources: string[];
}

export type SearchType = "web" | "images" | "videos" | "news";
export type TimeFilter =
  | "any"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "year"
  | "custom";
export type EngineConfig = Record<string, boolean>;

export interface EngineTiming {
  name: string;
  time: number;
  resultCount: number;
}

export type EngineFetch = (
  url: string,
  options?: {
    headers?: Record<string, string>;
    redirect?: RequestRedirect;
    signal?: AbortSignal;
  },
) => Promise<Response>;

export interface EngineContext {
  fetch: EngineFetch;
  lang?: string;
  dateFrom?: string;
  dateTo?: string;
  buildAcceptLanguage?: () => string;
}

export interface SearchResponse {
  results: ScoredResult[];
  query: string;
  totalTime: number;
  type: SearchType;
  engineTimings: EngineTiming[];
  relatedSearches: string[];
  slotPanels?: SlotPanelResult[];
}
