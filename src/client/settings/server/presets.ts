import type { ServerSettingsData } from "../../types/settings-server";

export type ServerPresetId =
  | "personal-local"
  | "private-team"
  | "public-web"
  | "hardened-public"
  | "indexer-discovery"
  | "compat-low-resource";

export type ServerPresetValueKey = keyof ServerSettingsData;

export type ServerPresetValues = Partial<Record<ServerPresetValueKey, string>>;

export type ServerSettingsPreset = {
  id: ServerPresetId;
  labelKey: string;
  descriptionKey: string;
  values: ServerPresetValues;
  warnings: string[];
  highlights: ServerPresetValueKey[];
};

export type ServerPresetFieldControl = "toggle" | "value";

export type ServerPresetField = {
  key: ServerPresetValueKey;
  domId: string;
  control: ServerPresetFieldControl;
};

export const SERVER_PRESET_FIELDS: readonly ServerPresetField[] = [
  { key: "streamingEnabled", domId: "streaming-enabled", control: "toggle" },
  { key: "streamingAutoRetry", domId: "streaming-auto-retry", control: "toggle" },
  { key: "streamingMaxRetries", domId: "streaming-max-retries", control: "value" },
  { key: "streamingPanelsMaxWaitMs", domId: "streaming-panels-max-wait", control: "value" },
  { key: "rateLimitEnabled", domId: "rate-limit-enabled", control: "toggle" },
  { key: "rateLimitBurstWindow", domId: "rate-limit-burst-window", control: "value" },
  { key: "rateLimitBurstMax", domId: "rate-limit-burst-max", control: "value" },
  { key: "rateLimitLongWindow", domId: "rate-limit-long-window", control: "value" },
  { key: "rateLimitLongMax", domId: "rate-limit-long-max", control: "value" },
  { key: "rateLimitSuggestEnabled", domId: "rate-limit-suggest-enabled", control: "toggle" },
  { key: "rateLimitSuggestBurstWindow", domId: "rate-limit-suggest-burst-window", control: "value" },
  { key: "rateLimitSuggestBurstMax", domId: "rate-limit-suggest-burst-max", control: "value" },
  { key: "rateLimitSuggestLongWindow", domId: "rate-limit-suggest-long-window", control: "value" },
  { key: "rateLimitSuggestLongMax", domId: "rate-limit-suggest-long-max", control: "value" },
  { key: "acDebounceMs", domId: "ac-debounce-ms", control: "value" },
  { key: "imageProxyAllowLocal", domId: "image-proxy-allow-local", control: "toggle" },
  { key: "honeypotEnabled", domId: "honeypot-enabled", control: "toggle" },
  { key: "honeypotCssCheck", domId: "honeypot-css-check", control: "toggle" },
  { key: "honeypotBanDuration", domId: "honeypot-ban-duration", control: "value" },
  { key: "apiKeySearchEnabled", domId: "api-key-search-enabled", control: "toggle" },
  { key: "apiKeySuggestEnabled", domId: "api-key-suggest-enabled", control: "toggle" },
  { key: "degoogIndexerEnabled", domId: "degoog-indexer-enabled", control: "toggle" },
  { key: "domainBlockUiEnabled", domId: "domain-block-ui-enabled", control: "toggle" },
  { key: "domainReplaceUiEnabled", domId: "domain-replace-ui-enabled", control: "toggle" },
  { key: "domainScoreUiEnabled", domId: "domain-score-ui-enabled", control: "toggle" },
] as const;

export const PRESET_FIELD_DOM_IDS: Partial<Record<ServerPresetValueKey, string>> =
  Object.fromEntries(SERVER_PRESET_FIELDS.map((field) => [field.key, field.domId]));

export const PRESET_TOGGLE_KEYS: ReadonlySet<ServerPresetValueKey> = new Set(
  SERVER_PRESET_FIELDS.filter((field) => field.control === "toggle").map(
    (field) => field.key,
  ),
);

export const SERVER_SETTINGS_PRESETS: readonly ServerSettingsPreset[] = [
  {
    id: "personal-local",
    labelKey: "settings-page.server.presets.personal-local.label",
    descriptionKey: "settings-page.server.presets.personal-local.desc",
    values: {
      streamingEnabled: "true",
      streamingAutoRetry: "true",
      streamingMaxRetries: "2",
      rateLimitEnabled: "false",
      rateLimitBurstWindow: "60",
      rateLimitBurstMax: "120",
      rateLimitLongWindow: "3600",
      rateLimitLongMax: "1000",
      rateLimitSuggestEnabled: "false",
      rateLimitSuggestBurstWindow: "60",
      rateLimitSuggestBurstMax: "240",
      rateLimitSuggestLongWindow: "3600",
      rateLimitSuggestLongMax: "2000",
      acDebounceMs: "200",
      imageProxyAllowLocal: "true",
      honeypotEnabled: "true",
      honeypotCssCheck: "true",
      honeypotBanDuration: "24",
      apiKeySearchEnabled: "false",
      apiKeySuggestEnabled: "false",
    },
    warnings: [
      "settings-page.server.presets.warnings.local-only",
    ],
    highlights: [
      "streamingEnabled",
      "streamingAutoRetry",
      "rateLimitEnabled",
      "rateLimitSuggestEnabled",
      "imageProxyAllowLocal",
      "honeypotEnabled",
      "apiKeySearchEnabled",
      "apiKeySuggestEnabled",
    ],
  },
  {
    id: "private-team",
    labelKey: "settings-page.server.presets.private-team.label",
    descriptionKey: "settings-page.server.presets.private-team.desc",
    values: {
      streamingEnabled: "true",
      streamingAutoRetry: "true",
      streamingMaxRetries: "2",
      rateLimitEnabled: "true",
      rateLimitBurstWindow: "60",
      rateLimitBurstMax: "60",
      rateLimitLongWindow: "3600",
      rateLimitLongMax: "600",
      rateLimitSuggestEnabled: "true",
      rateLimitSuggestBurstWindow: "60",
      rateLimitSuggestBurstMax: "120",
      rateLimitSuggestLongWindow: "3600",
      rateLimitSuggestLongMax: "1200",
      acDebounceMs: "250",
      imageProxyAllowLocal: "false",
      honeypotEnabled: "true",
      honeypotCssCheck: "true",
      honeypotBanDuration: "48",
      apiKeySearchEnabled: "false",
      apiKeySuggestEnabled: "false",
    },
    warnings: [
      "settings-page.server.presets.warnings.private-team",
    ],
    highlights: [
      "streamingEnabled",
      "streamingAutoRetry",
      "rateLimitEnabled",
      "rateLimitSuggestEnabled",
      "imageProxyAllowLocal",
      "honeypotEnabled",
      "apiKeySearchEnabled",
      "apiKeySuggestEnabled",
    ],
  },
  {
    id: "public-web",
    labelKey: "settings-page.server.presets.public-web.label",
    descriptionKey: "settings-page.server.presets.public-web.desc",
    values: {
      streamingEnabled: "true",
      streamingAutoRetry: "false",
      rateLimitEnabled: "true",
      rateLimitBurstWindow: "20",
      rateLimitBurstMax: "15",
      rateLimitLongWindow: "600",
      rateLimitLongMax: "150",
      rateLimitSuggestEnabled: "true",
      rateLimitSuggestBurstWindow: "20",
      rateLimitSuggestBurstMax: "60",
      rateLimitSuggestLongWindow: "60",
      rateLimitSuggestLongMax: "120",
      acDebounceMs: "300",
      imageProxyAllowLocal: "false",
      honeypotEnabled: "true",
      honeypotCssCheck: "true",
      honeypotBanDuration: "72",
      apiKeySearchEnabled: "false",
      apiKeySuggestEnabled: "false",
    },
    warnings: [
      "settings-page.server.presets.warnings.public-password",
      "settings-page.server.presets.warnings.public-https",
      "settings-page.server.presets.warnings.public-monitor",
    ],
    highlights: [
      "streamingEnabled",
      "streamingAutoRetry",
      "rateLimitEnabled",
      "rateLimitSuggestEnabled",
      "acDebounceMs",
      "imageProxyAllowLocal",
      "honeypotBanDuration",
    ],
  },
  {
    id: "hardened-public",
    labelKey: "settings-page.server.presets.hardened-public.label",
    descriptionKey: "settings-page.server.presets.hardened-public.desc",
    values: {
      streamingEnabled: "true",
      streamingAutoRetry: "false",
      rateLimitEnabled: "true",
      rateLimitBurstWindow: "20",
      rateLimitBurstMax: "8",
      rateLimitLongWindow: "600",
      rateLimitLongMax: "80",
      rateLimitSuggestEnabled: "true",
      rateLimitSuggestBurstWindow: "20",
      rateLimitSuggestBurstMax: "25",
      rateLimitSuggestLongWindow: "60",
      rateLimitSuggestLongMax: "60",
      acDebounceMs: "500",
      imageProxyAllowLocal: "false",
      honeypotEnabled: "true",
      honeypotCssCheck: "true",
      honeypotBanDuration: "168",
      apiKeySearchEnabled: "true",
      apiKeySuggestEnabled: "true",
    },
    warnings: [
      "settings-page.server.presets.warnings.public-password",
      "settings-page.server.presets.warnings.public-https",
      "settings-page.server.presets.warnings.api-key",
      "settings-page.server.presets.warnings.hardened",
    ],
    highlights: [
      "streamingEnabled",
      "streamingAutoRetry",
      "rateLimitEnabled",
      "rateLimitSuggestEnabled",
      "acDebounceMs",
      "imageProxyAllowLocal",
      "honeypotBanDuration",
      "apiKeySearchEnabled",
      "apiKeySuggestEnabled",
    ],
  },
  {
    id: "indexer-discovery",
    labelKey: "settings-page.server.presets.indexer-discovery.label",
    descriptionKey: "settings-page.server.presets.indexer-discovery.desc",
    values: {
      streamingEnabled: "true",
      streamingAutoRetry: "true",
      streamingMaxRetries: "3",
      degoogIndexerEnabled: "true",
      rateLimitEnabled: "true",
      rateLimitBurstWindow: "60",
      rateLimitBurstMax: "45",
      rateLimitLongWindow: "3600",
      rateLimitLongMax: "400",
      rateLimitSuggestEnabled: "true",
      rateLimitSuggestBurstWindow: "60",
      rateLimitSuggestBurstMax: "90",
      rateLimitSuggestLongWindow: "3600",
      rateLimitSuggestLongMax: "900",
      acDebounceMs: "300",
      domainBlockUiEnabled: "true",
      domainReplaceUiEnabled: "true",
      domainScoreUiEnabled: "true",
      imageProxyAllowLocal: "false",
      honeypotEnabled: "true",
      honeypotCssCheck: "true",
      honeypotBanDuration: "72",
    },
    warnings: [
      "settings-page.server.presets.warnings.indexer-storage",
      "settings-page.server.presets.warnings.public-password",
    ],
    highlights: [
      "streamingEnabled",
      "streamingAutoRetry",
      "streamingMaxRetries",
      "degoogIndexerEnabled",
      "rateLimitEnabled",
      "domainBlockUiEnabled",
      "domainReplaceUiEnabled",
      "domainScoreUiEnabled",
      "imageProxyAllowLocal",
    ],
  },
  {
    id: "compat-low-resource",
    labelKey: "settings-page.server.presets.compat-low-resource.label",
    descriptionKey: "settings-page.server.presets.compat-low-resource.desc",
    values: {
      streamingEnabled: "false",
      streamingAutoRetry: "false",
      rateLimitEnabled: "true",
      rateLimitBurstWindow: "60",
      rateLimitBurstMax: "45",
      rateLimitLongWindow: "3600",
      rateLimitLongMax: "350",
      rateLimitSuggestEnabled: "true",
      rateLimitSuggestBurstWindow: "60",
      rateLimitSuggestBurstMax: "90",
      rateLimitSuggestLongWindow: "3600",
      rateLimitSuggestLongMax: "800",
      acDebounceMs: "350",
      imageProxyAllowLocal: "false",
      honeypotEnabled: "true",
      honeypotCssCheck: "true",
      honeypotBanDuration: "72",
      apiKeySearchEnabled: "false",
      apiKeySuggestEnabled: "false",
    },
    warnings: [
      "settings-page.server.presets.warnings.compat",
    ],
    highlights: [
      "streamingEnabled",
      "streamingAutoRetry",
      "rateLimitEnabled",
      "rateLimitSuggestEnabled",
      "acDebounceMs",
      "imageProxyAllowLocal",
      "honeypotEnabled",
      "apiKeySearchEnabled",
      "apiKeySuggestEnabled",
    ],
  },
] as const;
