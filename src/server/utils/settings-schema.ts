export type SettingKind = "string" | "boolean" | "number" | "lines";

export interface SettingDef {
  kind: SettingKind;
  default: string | boolean;
}

export const SETTINGS_SCHEMA = {
  proxyEnabled:                 { kind: "boolean", default: false },
  proxyUrls:                    { kind: "lines",   default: "" },
  imageProxyAllowLocal:         { kind: "boolean", default: false },
  imageProxyAllowList:          { kind: "lines",   default: "" },
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
  acDebounceMs:                 { kind: "number",  default: "300" },
  languagesEnabled:             { kind: "boolean", default: false },
  languages:                    { kind: "lines",   default: "" },
  streamingEnabled:             { kind: "boolean", default: true },
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
  degoogIndexerDomainAllowlist: { kind: "lines",   default: "" },
  degoogIndexerDomainBlocklist: { kind: "lines",   default: "" },
  degoogIndexerWordBlocklist:   { kind: "lines",   default: "" },
} satisfies Record<string, SettingDef>;

export type SettingKey = keyof typeof SETTINGS_SCHEMA;

export const coerceSetting = (def: SettingDef, raw: string): string | boolean => {
  switch (def.kind) {
    case "boolean": return raw === "true";
    case "number": {
      const n = Number(raw);
      return Number.isFinite(n) ? String(Math.trunc(n)) : String(def.default);
    }
    default: return raw;
  }
};
