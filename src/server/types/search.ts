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

export interface KnowledgePanel {
  title: string;
  description: string;
  image?: string;
  url: string;
  facts?: Record<string, string>;
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
  atAGlance: ScoredResult | null;
  query: string;
  totalTime: number;
  type: SearchType;
  engineTimings: EngineTiming[];
  relatedSearches: string[];
  knowledgePanel: KnowledgePanel | null;
  slotPanels?: SlotPanelResult[];
}
