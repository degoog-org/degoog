import type {
  SearchResult,
  ScoredResult,
  TimeFilter,
  EngineContext,
} from "./search";

export type TranslationVars = string | number | boolean;
export type TranslationRecord = {
  [key: string]: TranslationVars | TranslationRecord;
};
export interface Translate {
  (
    key: string,
    vars?: Record<string, TranslationVars> | TranslationVars[],
  ): string;
  setLocale(locale: string): void;
  locale: string;
  translations?: TranslationRecord;
}
export const TranslateFunction: Translate = Object.assign(
  function (
    key: string,
    _vars?: Record<string, TranslationVars> | TranslationVars[],
  ): string {
    return key;
  },
  {
    setLocale(_locale: string) { },
    locale: "",
    translations: undefined as TranslationRecord | undefined,
  },
);

export enum ExtensionStoreType {
  Plugin = "plugin",
  Theme = "theme",
  Engine = "engine",
  Transport = "transport",
}

export interface SettingField {
  key: string;
  label: string;
  type:
  | "text"
  | "number"
  | "password"
  | "url"
  | "toggle"
  | "textarea"
  | "select";
  required?: boolean;
  placeholder?: string;
  description?: string;
  secret?: boolean;
  options?: string[];
  default?: string;
  advanced?: boolean;
}

export interface ExtensionMeta {
  id: string;
  displayName: string;
  description: string;
  type: ExtensionStoreType | "command";
  configurable: boolean;
  settingsSchema: SettingField[];
  settings: Record<string, string | string[]>;
  source?: "builtin" | "plugin";
  extensionDocsAvailable?: boolean;
  defaultEnabled?: boolean;
  defaultFeedUrls?: string[];
  requiresNewerVersion?: boolean;
}

export interface PluginContext {
  dir: string;
  template: string;
  readFile: (filename: string) => Promise<string>;
  signProxyUrl: (url: string) => string;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
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
  t?: Translate;
}

export enum SlotPanelPosition {
  AboveResults = "above-results",
  BelowResults = "below-results",
  AboveSidebar = "above-sidebar",
  BelowSidebar = "below-sidebar",
  KnowledgePanel = "knowledge-panel",
  AtAGlance = "at-a-glance",
}

export const SLOT_POSITION_SETTING_KEY = "slotPosition";

export interface SlotPanelResult {
  id: string;
  title?: string;
  html: string;
  position: SlotPanelPosition;
  gridSize?: 1 | 2 | 3 | 4;
}

export interface SlotPluginContext {
  clientIp?: string;
  results?: ScoredResult[];
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  signProxyUrl?: (url: string) => string;
}

export interface SlotPlugin {
  id: string;
  name: string;
  description: string;
  position: SlotPanelPosition;
  slotPositions?: SlotPanelPosition[];
  settingsId?: string;
  trigger: (query: string) => boolean | Promise<boolean>;
  waitForResults?: boolean;
  gridSize?: 1 | 2 | 3 | 4;
  execute(
    query: string,
    context?: SlotPluginContext,
  ): Promise<{ title?: string; html: string }>;
  settingsSchema?: SettingField[];
  configure?(settings: Record<string, string | string[]>): void;
  init?(context: PluginContext): void | Promise<void>;
  t?: Translate;
}

export interface CommandResult {
  title: string;
  html: string;
  totalPages?: number;
  action?: string;
}

export interface CommandContext {
  clientIp?: string;
  page?: number;
  signProxyUrl?: (url: string) => string;
}

export interface BangCommand {
  name: string;
  description: string;
  trigger: string;
  aliases?: string[];
  naturalLanguagePhrases?: string[];
  settingsSchema?: SettingField[];
  configure?(settings: Record<string, string | string[]>): void;
  isConfigured?(): Promise<boolean>;
  init?(context: PluginContext): void | Promise<void>;
  execute(args: string, context?: CommandContext): Promise<CommandResult>;
  t?: Translate;
}

export interface SearchResultTab {
  id: string;
  name: string;
  icon?: string;
  engineType?: string;
  settingsId?: string;
  executeSearch?(
    query: string,
    page?: number,
    context?: { clientIp?: string },
  ): Promise<{ results: SearchResult[]; totalPages?: number }>;
  settingsSchema?: SettingField[];
  configure?(settings: Record<string, string | string[]>): void;
  init?(context: PluginContext): void | Promise<void>;
  t?: Translate;
}

export interface MiddlewareResult {
  redirect: string;
}

export interface RequestMiddleware {
  id: string;
  name: string;
  settingsId?: string;
  settingsSchema?: SettingField[];
  configure?(settings: Record<string, string | string[]>): void;
  init?(context: PluginContext): void | Promise<void>;
  handle(
    req: Request,
    context?: { route?: string },
  ): Response | Promise<Response | MiddlewareResult | null>;
  t?: Translate;
}

export type SearchBarActionType = "navigate" | "bang" | "custom";

export interface SearchBarAction {
  id: string;
  label: string;
  icon?: string;
  type: SearchBarActionType;
  url?: string;
  trigger?: string;
  t?: Translate;
}

export type PluginRouteMethod = "get" | "post" | "put" | "delete" | "patch";

export interface PluginRoute {
  method: PluginRouteMethod;
  path: string;
  handler: (req: Request) => Response | Promise<Response>;
  t?: Translate;
}

export interface TransportFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  redirect?: RequestRedirect;
  signal?: AbortSignal;
}

export type ProxyAwareFetch = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

export interface TransportContext {
  proxyUrl?: string;
  fetch: ProxyAwareFetch;
}

export interface Transport {
  name: string;
  displayName?: string;
  description?: string;
  timeoutMs?: number;
  settingsSchema?: SettingField[];
  configure?(settings: Record<string, string | string[]>): void;
  available(): boolean | Promise<boolean>;
  fetch(
    url: string,
    options: TransportFetchOptions,
    context: TransportContext,
  ): Promise<Response>;
}

export interface UovadipasquaSearchQueryTrigger {
  type: "search-query";
  pattern: string;
  chance?: number;
}

export type UovadipasquaTrigger = UovadipasquaSearchQueryTrigger;
export interface Uovadipasqua {
  id: string;
  triggers: UovadipasquaTrigger[];
  waitForResults?: boolean;
}
export interface UovadipasquaMatch {
  id: string;
  scriptUrl: string;
  styleUrl: string | null;
  waitForResults: boolean;
}
