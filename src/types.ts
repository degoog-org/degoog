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
  settings: Record<string, string | string[]>;
  defaultEnabled?: boolean;
  defaultFeedUrls?: string[];
}

export type EngineFetch = (
  url: string,
  options?: { headers?: Record<string, string>; redirect?: RequestRedirect; signal?: AbortSignal },
) => Promise<Response>;

export interface EngineContext {
  fetch: EngineFetch;
}

export interface SearchEngine {
  name: string;
  bangShortcut?: string;
  settingsSchema?: SettingField[];
  configure?(settings: Record<string, string | string[]>): void;
  executeSearch(
    query: string,
    page?: number,
    timeFilter?: TimeFilter,
    context?: EngineContext,
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

export type SlotPanelPosition =
  | "above-results"
  | "below-results"
  | "sidebar"
  | "at-a-glance";

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

export interface SlotPluginContext {
  clientIp?: string;
  results?: ScoredResult[];
}

export interface SlotPlugin {
  id: string;
  name: string;
  description: string;
  position: SlotPanelPosition;
  settingsId?: string;
  trigger: (query: string) => boolean | Promise<boolean>;
  execute(
    query: string,
    context?: SlotPluginContext,
  ): Promise<{ title?: string; html: string }>;
  settingsSchema?: SettingField[];
  configure?(settings: Record<string, string>): void;
  init?(context: PluginContext): void | Promise<void>;
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
  naturalLanguagePhrases?: string[];
  settingsSchema?: SettingField[];
  configure?(settings: Record<string, string>): void;
  isConfigured?(): Promise<boolean>;
  init?(context: PluginContext): void | Promise<void>;
  execute(args: string, context?: CommandContext): Promise<CommandResult>;
}

export interface CommandContext {
  clientIp?: string;
  page?: number;
}

export interface PluginContext {
  dir: string;
  template: string;
  readFile: (filename: string) => Promise<string>;
}

export type SearchBarActionType = "navigate" | "bang" | "custom";

export interface SearchBarAction {
  id: string;
  label: string;
  icon?: string;
  type: SearchBarActionType;
  url?: string;
  trigger?: string;
}

export interface MiddlewareResult {
  redirect: string;
}

export interface RequestMiddleware {
  id: string;
  name: string;
  handle(
    req: Request,
    context?: { route?: string },
  ): Response | Promise<Response | MiddlewareResult | null>;
}

export type PluginRouteMethod = "get" | "post" | "put" | "delete" | "patch";

export interface PluginRoute {
  method: PluginRouteMethod;
  path: string;
  handler: (req: Request) => Response | Promise<Response>;
}
