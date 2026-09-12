export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  thumbnail?: string;
  imageUrl?: string;
  isGif?: boolean;
  duration?: string;
}

export const DEGOOG_ENGINE_NAME = "Degoog";

export type IndexRelation = "recalled" | "indexing";

export interface ScoredResult extends SearchResult {
  score: number;
  sources: string[];
  insecure?: boolean;
  idx?: IndexRelation;
}

export interface EngineTiming {
  name: string;
  time: number;
  resultCount: number;
  status?: string;
  errorReason?: string;
  httpStatus?: number;
}

export enum SlotPanelPosition {
  AboveResults = "above-results",
  BelowResults = "below-results",
  FullWidthAboveResults = "full-width-above-results",
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

export interface EnginePagination {
  total?: number;
}

export interface SearchResponse {
  results: ScoredResult[];
  query: string;
  totalTime: number;
  type: string;
  engineTimings: EngineTiming[];
  relatedSearches: string[];
  slotPanels?: SlotPanel[];
  totalPages?: number;
}

export const DEFAULT_SEARCH_TYPE = "web";
export const IMAGE_SEARCH_TYPE = "images";

const TAB_ENGINE_PREFIX = "tab:engine:";
const ENGINE_PREFIX = "engine:";

export const resolveBuiltinSearchType = (type: string): string => {
  if (type.startsWith(TAB_ENGINE_PREFIX)) {
    return type.slice(TAB_ENGINE_PREFIX.length);
  }
  if (type.startsWith(ENGINE_PREFIX)) return type.slice(ENGINE_PREFIX.length);
  return type;
};

export const isImageSearchType = (type: string): boolean =>
  resolveBuiltinSearchType(type) === IMAGE_SEARCH_TYPE;

export const parseTypeList = (
  raw: string | string[] | boolean | undefined,
): string[] => {
  const entries = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(",")
      : [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const type = String(entry).trim();
    if (type && type !== IMAGE_SEARCH_TYPE) seen.add(type);
  }
  return [...seen];
};

export const slotRunsOn = (allowed: string[], type: string): boolean =>
  !isImageSearchType(type) &&
  allowed.includes(resolveBuiltinSearchType(type) || DEFAULT_SEARCH_TYPE);
