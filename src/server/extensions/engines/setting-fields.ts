import type { SettingField } from "../../../shared/setting-field";

export const SCORE_FIELD: SettingField = {
  key: "score",
  label: "Score",
  type: "number",
  default: "1",
  description:
    "Result ranking multiplier for this engine. Higher values favour its results.",
  advanced: true,
};

export const OUTGOING_TRANSPORT_FIELD: SettingField = {
  key: "outgoingTransport",
  label: "Outgoing HTTP client transport",
  type: "select",
  options: ["fetch", "curl", "curl-fallback"],
  default: "fetch",
  description: "The outgoing HTTP client to use for this engine.",
  advanced: true,
};

export const ENGINE_TIMEOUT_MS = 10_000;

export const TIMEOUT_FIELD: SettingField = {
  key: "timeoutMs",
  label: "Timeout (ms)",
  type: "number",
  default: "",
  placeholder: String(ENGINE_TIMEOUT_MS),
  description:
    "Maximum time in milliseconds to wait for this engine before giving up. Leave blank to use the default.",
  advanced: true,
};

export const CUSTOM_USER_AGENTS_FIELD: SettingField = {
  key: "customUserAgents",
  label: "Custom user agents",
  type: "textarea",
  default: "",
  description:
    "One user agent per line. A random one will be used per request for this engine.",
  advanced: true,
};

export const PROXY_OVERRIDE_ENABLED_FIELD: SettingField = {
  key: "proxyOverrideEnabled",
  label: "Override proxies",
  type: "toggle",
  default: "false",
  description:
    "When enabled, this engine uses its own proxy list and ignores global proxy settings.",
  advanced: true,
};

export const PROXY_OVERRIDE_URLS_FIELD: SettingField = {
  key: "proxyOverrideUrls",
  label: "Proxy override list",
  type: "textarea",
  default: "",
  description:
    "One proxy URL per line. Used only when override is enabled for this engine.",
  advanced: true,
  visibleWhen: { key: "proxyOverrideEnabled", equals: "true" },
};
