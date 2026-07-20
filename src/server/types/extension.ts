import type { CreateCache, UseCache } from "../utils/cache";
import type { SettingValue } from "../utils/plugin-settings";
import type {
  SearchResult,
  ScoredResult,
  TimeFilter,
  EngineContext,
} from "./search";
import { SlotPanelPosition } from "../../shared/search-types";

export type TranslationVars = string | number | boolean;
export type TranslationRecord = {
  [key: string]: TranslationVars | TranslationRecord;
};
export interface Translate {
  (
    key: string,
    vars?: Record<string, TranslationVars> | TranslationVars[],
    locale?: string,
  ): string;
  defaultLocale: string;
  translations: TranslationRecord;
}
export const TranslateFunction: Translate = Object.assign(
  function (
    key: string,
    _vars?: Record<string, TranslationVars> | TranslationVars[],
    _locale?: string,
  ): string {
    return key;
  },
  {
    defaultLocale: "",
    translations: {} as TranslationRecord,
  },
);

export enum ExtensionStoreType {
  Plugin = "plugin",
  Theme = "theme",
  Engine = "engine",
  Transport = "transport",
  Autocomplete = "autocomplete",
  Shortcut = "shortcut",
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
  | "select"
  | "urllist"
  | "list"
  | "hex"
  | "range"
  | "file"
  | "info";
  required?: boolean;
  placeholder?: string;
  description?: string;
  secret?: boolean;
  options?: string[];
  optionLabels?: string[];
  default?: string;
  advanced?: boolean;
  visibleWhen?: { key: string; equals: string };
  itemSchema?: SettingField[];
  addLabel?: string;
  fieldset?: string;
  min?: string;
  max?: string;
  step?: string;
  accept?: string;
  maxSizeKb?: string;
  minSizeKb?: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  description?: string;
  settingsSchema?: SettingField[];
  configure?(settings: Record<string, SettingValue>): void;
}

export interface ExtensionMeta {
  id: string;
  displayName: string;
  description: string;
  primaryType?: string;
  searchTypes?: string[];
  type: ExtensionStoreType | "command" | "interceptor";
  trigger?: string;
  configurable: boolean;
  settingsSchema: SettingField[];
  settings: Record<string, SettingValue>;
  source?: "builtin" | "plugin";
  extensionDocsAvailable?: boolean;
  defaultEnabled?: boolean;
  defaultFeedUrls?: string[];
  isClientExposed?: boolean;
  requiresNewerVersion?: boolean;
  needsAppRestart?: boolean;
}

export interface PluginContext {
  id: string;
  pluginId: string;
  apiBase: string;
  routeUrl: (path?: string) => string;
  dir: string;
  template: string;
  readFile: (filename: string) => Promise<string>;
  signProxyUrl: (url: string) => string;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  /** @deprecated Use `useCache` (async, namespaced, Valkey-backed when enabled). */
  createCache: CreateCache;
  useCache: UseCache;
}

export interface SearchEngine {
  name: string;
  bangShortcut?: string;
  needsAppRestart?: boolean;
  settingsSchema?: SettingField[];
  configure?(settings: Record<string, SettingValue>): void;
  executeSearch(
    query: string,
    page?: number,
    timeFilter?: TimeFilter,
    context?: EngineContext,
  ): Promise<SearchResult[]>;
  t?: Translate;
}

export interface AutocompleteContext {
  fetch: typeof fetch;
  lang?: string;
  userAgent?: () => string;
  /** @deprecated Use `useCache` (async, namespaced, Valkey-backed when enabled). */
  createCache: CreateCache;
  useCache: UseCache;
}

export interface RichSuggestion {
  description?: string;
  thumbnail?: string;
  type?: string;
}

export type AutocompleteSuggestion =
  | string
  | { text: string; rich?: RichSuggestion };

export interface AutocompleteProvider {
  name: string;
  needsAppRestart?: boolean;
  settingsSchema?: SettingField[];
  configure?(settings: Record<string, SettingValue>): void;
  getSuggestions(
    query: string,
    context?: AutocompleteContext,
  ): Promise<AutocompleteSuggestion[]>;
}

export const SLOT_POSITION_SETTING_KEY = "slotPosition";

export interface SlotPluginContext {
  clientIp?: string;
  results?: ScoredResult[];
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  signProxyUrl?: (url: string) => string;
  /** @deprecated Use `useCache` (async, namespaced, Valkey-backed when enabled). */
  createCache: CreateCache;
  useCache: UseCache;
}

export interface SlotPlugin {
  id?: string;
  name: string;
  description: string;
  position: SlotPanelPosition;
  slotPositions?: SlotPanelPosition[];
  settingsId?: string;
  isClientExposed?: boolean;
  needsAppRestart?: boolean;
  priority?: number;
  trigger: (query: string) => boolean | Promise<boolean>;
  waitForResults?: boolean;
  gridSize?: 1 | 2 | 3 | 4;
  execute(
    query: string,
    context?: SlotPluginContext,
  ): Promise<{ title?: string; html: string }>;
  settingsSchema?: SettingField[];
  configure?(settings: Record<string, SettingValue>): void;
  init?(context: PluginContext): void | Promise<void>;
  t?: Translate;
  pluginManifest?: PluginManifest;
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
  isClientExposed?: boolean;
  needsAppRestart?: boolean;
  settingsSchema?: SettingField[];
  configure?(settings: Record<string, SettingValue>): void;
  isConfigured?(): Promise<boolean>;
  init?(context: PluginContext): void | Promise<void>;
  execute(args: string, context?: CommandContext): Promise<CommandResult>;
  t?: Translate;
}

export interface SearchResultTab {
  id?: string;
  name: string;
  icon?: string;
  engineType?: string;
  isClientExposed?: boolean;
  needsAppRestart?: boolean;
  settingsId?: string;
  executeSearch?(
    query: string,
    page?: number,
    context?: { clientIp?: string },
  ): Promise<{ results: SearchResult[]; totalPages?: number }>;
  settingsSchema?: SettingField[];
  configure?(settings: Record<string, SettingValue>): void;
  init?(context: PluginContext): void | Promise<void>;
  t?: Translate;
}

export interface MiddlewareResult {
  redirect: string;
}

export interface RequestMiddleware {
  id?: string;
  name: string;
  settingsId?: string;
  isClientExposed?: boolean;
  needsAppRestart?: boolean;
  settingsSchema?: SettingField[];
  configure?(settings: Record<string, SettingValue>): void;
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
  isClientExposed?: boolean;
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
  engineId?: string;
  fetch: ProxyAwareFetch;
  useCache: UseCache;
}

export interface TransportWsSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface TransportWsHandlers {
  onUpgrade?(passwordPath: string): boolean;
  onOpen(ws: TransportWsSocket): void;
  onMessage(ws: TransportWsSocket, msg: string): void;
  onClose(ws: TransportWsSocket): void;
}

export interface Transport {
  name: string;
  displayName?: string;
  description?: string;
  timeoutMs?: number;
  needsAppRestart?: boolean;
  settingsSchema?: SettingField[];
  configure?(settings: Record<string, SettingValue>): void;
  available(): boolean | Promise<boolean>;
  fetch(
    url: string,
    options: TransportFetchOptions,
    context: TransportContext,
  ): Promise<Response>;
  wsHandler?: TransportWsHandlers;
}

export interface InterceptorOverrides {
  searchType?: string;
  lang?: string;
  timeFilter?: string;
}

export interface InterceptorResult {
  query: string;
  overrides?: InterceptorOverrides;
}

export interface QueryInterceptorContext {
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  /** @deprecated Use `useCache` (async, namespaced, Valkey-backed when enabled). */
  createCache: CreateCache;
  useCache: UseCache;
  lang?: string;
}

export interface QueryInterceptor {
  name: string;
  description: string;
  settingsId?: string;
  isClientExposed?: boolean;
  needsAppRestart?: boolean;
  settingsSchema?: SettingField[];
  priority?: number;
  configure?(settings: Record<string, SettingValue>): void;
  init?(context: PluginContext): void | Promise<void>;
  intercept(
    query: string,
    context?: QueryInterceptorContext,
  ): Promise<InterceptorResult>;
  t?: Translate;
  pluginManifest?: PluginManifest;
}

export interface UovadipasquaSearchQueryTrigger {
  type: "search-query";
  pattern: string;
  chance?: number;
}

export type UovadipasquaTrigger = UovadipasquaSearchQueryTrigger;

export interface UovadipasquaClientStorageBinding {
  extensionId: string;
  styleUrl?: string;
  localStorageKey?: string;
  apiBase?: string;
}

export interface Uovadipasqua {
  id?: string;
  triggers: UovadipasquaTrigger[];
  waitForResults?: boolean;
  repeatOnQuery?: boolean;
  clientStorage?: {
    localStorageKey: string;
  };
  proxyImages?: Record<string, string>;
  routes?: PluginRoute[];
}
export interface UovadipasquaMatch {
  id: string;
  scriptUrl: string;
  styleUrl?: string;
  waitForResults: boolean;
  repeatOnQuery?: boolean;
  assets?: Record<string, string>;
  apiBase?: string;
}
