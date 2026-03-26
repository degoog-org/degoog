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
}

export interface SearchResponse {
  results: ScoredResult[];
  atAGlance: ScoredResult | null;
  query: string;
  totalTime: number;
  type: string;
  engineTimings: EngineTiming[];
  relatedSearches: string[];
  knowledgePanel: KnowledgePanel | null;
  slotPanels?: SlotPanel[];
}

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
}

export type SettingFieldType =
  | "text"
  | "password"
  | "url"
  | "toggle"
  | "textarea"
  | "select"
  | "urllist";

export interface SettingField {
  key: string;
  label: string;
  type: SettingFieldType;
  required?: boolean;
  placeholder?: string;
  description?: string;
  secret?: boolean;
  options?: string[];
}

export interface ExtensionMeta {
  id: string;
  displayName: string;
  description: string;
  type: string;
  configurable: boolean;
  settingsSchema: SettingField[];
  settings: Record<string, string | string[]>;
  defaultEnabled?: boolean;
  defaultFeedUrls?: string[];
}

export interface AllExtensions {
  engines: ExtensionMeta[];
  plugins: ExtensionMeta[];
  themes: ExtensionMeta[];
}

export interface SearchBarAction {
  id: string;
  label: string;
  icon?: string;
  type: "navigate" | "bang" | "custom";
  url?: string;
  trigger?: string;
}

export interface Command {
  id: string;
  trigger: string;
  aliases?: string[];
  naturalLanguage?: boolean;
  naturalLanguagePhrases?: string[];
}

export interface EngineRegistry {
  engines: Array<{ id: string; displayName: string }>;
  defaults?: EngineRecord;
}

export interface NewsItem {
  title: string;
  url: string;
  thumbnail?: string;
  sources?: string[];
}
