import {
  DEFAULT_ENGINE_ORIGIN_DISPLAY,
  ENGINE_ORIGIN_DISPLAY_VALUES,
} from "../../../shared/engine-origins";
import {
  DEFAULT_FAVICON_SHAPE,
  FAVICON_SHAPE_VALUES,
} from "../../../shared/favicon-shapes";

type SettingKind = "string" | "boolean" | "number" | "lines";

interface SettingDef {
  kind: SettingKind;
  default: string | boolean;
  values?: readonly string[];
  min?: number;
  max?: number;
}

export const SETTINGS_SCHEMA = {
  proxyEnabled:                 { kind: "boolean", default: false },
  proxyUrls:                    { kind: "lines",   default: "" },
  proxyCooldownMinutes:         { kind: "number",  default: "10", min: 0, max: 1440 },
  proxyCooldownTriggers:        { kind: "lines",   default: "rate_limited\ncaptcha\nblocked\nconnect" },
  proxyHostGroups:              { kind: "lines",   default: "" },
  imageProxyAllowLocal:         { kind: "boolean", default: false },
  imageProxyAllowList:          { kind: "lines",   default: "" },
  blockClientLeaks:             { kind: "boolean", default: false },
  privacyPolicy:                { kind: "string",  default: "" },
  rateLimitEnabled:             { kind: "boolean", default: false },
  rateLimitBurstWindow:         { kind: "number",  default: "60" },
  rateLimitBurstMax:            { kind: "number",  default: "30" },
  rateLimitLongWindow:          { kind: "number",  default: "3600" },
  rateLimitLongMax:             { kind: "number",  default: "200" },
  rateLimitSuggestEnabled:      { kind: "boolean", default: false },
  rateLimitSuggestBurstWindow:  { kind: "number",  default: "60" },
  rateLimitSuggestBurstMax:     { kind: "number",  default: "30" },
  rateLimitSuggestLongWindow:   { kind: "number",  default: "3600" },
  rateLimitSuggestLongMax:      { kind: "number",  default: "200" },
  requestBodyMaxKb:             { kind: "number",  default: "0" },
  acDebounceMs:                 { kind: "number",  default: "300" },
  languagesEnabled:             { kind: "boolean", default: false },
  languages:                    { kind: "lines",   default: "" },
  streamingEnabled:             { kind: "boolean", default: true },
  infiniteScrollEnabled:        { kind: "boolean", default: false },
  streamingAutoRetry:           { kind: "boolean", default: true },
  streamingMaxRetries:          { kind: "number",  default: "2" },
  streamingDisabledTypes:       { kind: "lines",   default: "" },
  postMethodEnabled:            { kind: "boolean", default: false },
  defaultTheme:                 { kind: "string",  default: "system" },
  domainBlockEnabled:           { kind: "boolean", default: false },
  domainBlockList:              { kind: "lines",   default: "" },
  domainBlockUiEnabled:         { kind: "boolean", default: false },
  domainReplaceEnabled:         { kind: "boolean", default: false },
  domainReplaceList:            { kind: "lines",   default: "" },
  domainReplaceUiEnabled:       { kind: "boolean", default: false },
  domainScoreEnabled:           { kind: "boolean", default: false },
  domainScoreList:              { kind: "lines",   default: "" },
  domainScoreUiEnabled:         { kind: "boolean", default: false },
  customCss:                    { kind: "string",  default: "" },
  apiKeySearchEnabled:          { kind: "boolean", default: false },
  apiKeySuggestEnabled:         { kind: "boolean", default: false },
  honeypotEnabled:              { kind: "boolean", default: true },
  honeypotCssCheck:             { kind: "boolean", default: true },
  honeypotBanDuration:          { kind: "string",  default: "24h" },
  nojsEnabled:                  { kind: "boolean", default: false },
  nojsCssCheck:                 { kind: "boolean", default: false },
  degoogIndexerEnabled:         { kind: "boolean", default: false },
  degoogIndexerPublicExport:    { kind: "boolean", default: false },
  degoogIndexerMaxPerSearch:    { kind: "number",  default: "30" },
  degoogIndexerMaxUrls:         { kind: "number",  default: "0" },
  degoogIndexerMaxHits:         { kind: "number",  default: "0" },
  degoogIndexerMaxAgeDays:      { kind: "number",  default: "0" },
  degoogIndexerPruneEnabled:    { kind: "boolean", default: true },
  degoogIndexerFuzzyEnabled:       { kind: "boolean", default: true },
  degoogIndexerFuzzyMinTermRatio:  { kind: "number",  default: "0.6" },
  degoogIndexerQueryLimit:         { kind: "number",  default: "30" },
  degoogIndexerRankingWindow:      { kind: "number",  default: "20" },
  degoogIndexerDomainAllowlist: { kind: "lines",   default: "" },
  degoogIndexerDomainBlocklist: { kind: "lines",   default: "" },
  degoogIndexerWordBlocklist:   { kind: "lines",   default: "" },
  degoogFaviconStoreEnabled:    { kind: "boolean", default: true },
  degoogFaviconStoreMaxAgeDays: { kind: "number",  default: "30", min: 1, max: 3650 },
  searxCompatEnabled:           { kind: "boolean", default: false },
  searxApiEnabled:              { kind: "boolean", default: false },
  fourgetCompatEnabled:         { kind: "boolean", default: false },
  engineOriginDisplay:          { kind: "string",  default: DEFAULT_ENGINE_ORIGIN_DISPLAY, values: ENGINE_ORIGIN_DISPLAY_VALUES },
  faviconShape:                 { kind: "string",  default: DEFAULT_FAVICON_SHAPE, values: FAVICON_SHAPE_VALUES },
} satisfies Record<string, SettingDef>;

export type SettingKey = keyof typeof SETTINGS_SCHEMA;

export const coerceSetting = (def: SettingDef, raw: string): string | boolean => {
  switch (def.kind) {
    case "boolean": return raw === "true";
    case "number": {
      const n = Number(raw);
      if (!Number.isFinite(n)) return String(def.default);
      const low = def.min ?? -Infinity;
      const high = def.max ?? Infinity;
      return String(Math.min(high, Math.max(low, Math.trunc(n))));
    }
    default:
      if (def.values && !def.values.includes(raw)) return String(def.default);
      return raw;
  }
};
