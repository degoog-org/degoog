export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  thumbnail?: string;
  duration?: string;
}

export interface SettingField {
  key: string;
  label: string;
  type: "text" | "password" | "url" | "toggle" | "textarea";
  required?: boolean;
  placeholder?: string;
  description?: string;
  secret?: boolean;
}

export interface ExtensionMeta {
  id: string;
  displayName: string;
  description: string;
  type: "plugin" | "engine" | "command" | "theme";
  configurable: boolean;
  settingsSchema: SettingField[];
  settings: Record<string, string>;
  defaultEnabled?: boolean;
}

export interface SearchEngine {
  name: string;
  bangShortcut?: string;
  settingsSchema?: SettingField[];
  configure?(settings: Record<string, string>): void;
  executeSearch(
    query: string,
    page?: number,
    timeFilter?: TimeFilter,
  ): Promise<SearchResult[]>;
}

export type SearchType = "all" | "images" | "videos" | "news";
export type TimeFilter = "any" | "hour" | "day" | "week" | "month" | "year";

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

export type SlotPanelPosition = "above-results" | "below-results" | "sidebar";

export interface SlotPanelResult {
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
  type: SearchType;
  engineTimings: EngineTiming[];
  relatedSearches: string[];
  knowledgePanel: KnowledgePanel | null;
  slotPanels?: SlotPanelResult[];
}

export interface SlotPlugin {
  id: string;
  name: string;
  position: SlotPanelPosition;
  trigger: (query: string) => boolean | Promise<boolean>;
  execute(
    query: string,
    context?: { clientIp?: string },
  ): Promise<{ title?: string; html: string }>;
  settingsSchema?: SettingField[];
  configure?(settings: Record<string, string>): void;
}

export interface ScoredResult extends SearchResult {
  score: number;
  sources: string[];
}

export type EngineConfig = Record<string, boolean>;

export interface CommandResult {
  title: string;
  html: string;
  totalPages?: number;
  action?: string;
}

export interface BangCommand {
  name: string;
  description: string;
  trigger: string;
  aliases?: string[];
  settingsSchema?: SettingField[];
  configure?(settings: Record<string, string>): void;
  isConfigured?(): Promise<boolean>;
  execute(args: string, context?: CommandContext): Promise<CommandResult>;
}

export interface CommandContext {
  clientIp?: string;
  page?: number;
}
