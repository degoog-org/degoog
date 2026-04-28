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
  insecure?: boolean;
}

export interface AtAGlance {
  snippet: string;
  url: string;
  title: string;
  sources: string[];
}

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
}

export enum SlotPanelPosition {
  AboveResults = "above-results",
  BelowResults = "below-results",
  AboveSidebar = "above-sidebar",
  BelowSidebar = "below-sidebar",
  KnowledgePanel = "knowledge-panel",
  AtAGlance = "at-a-glance",
}

export interface SlotPanel {
  id: string;
  title?: string;
  html: string;
  position: SlotPanelPosition;
  gridSize?: 1 | 2 | 3 | 4;
}

export interface SearchResponse {
  results: ScoredResult[];
  query: string;
  totalTime: number;
  type: string;
  engineTimings: EngineTiming[];
  relatedSearches: string[];
  slotPanels?: SlotPanel[];
}

export interface NewsItem {
  title: string;
  url: string;
  thumbnail?: string;
  sources?: string[];
}
