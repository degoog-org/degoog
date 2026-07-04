export type BoolSetting = boolean | string;

export type ServerSettingsData = {
  proxyEnabled?: BoolSetting;
  proxyUrls?: string;
  imageProxyAllowLocal?: BoolSetting;
  imageProxyAllowList?: string;
  rateLimitEnabled?: BoolSetting;
  rateLimitBurstWindow?: string;
  rateLimitBurstMax?: string;
  rateLimitLongWindow?: string;
  rateLimitLongMax?: string;
  rateLimitSuggestEnabled?: BoolSetting;
  rateLimitSuggestBurstWindow?: string;
  rateLimitSuggestBurstMax?: string;
  rateLimitSuggestLongWindow?: string;
  rateLimitSuggestLongMax?: string;
  acDebounceMs?: string;
  languagesEnabled?: BoolSetting;
  languages?: string;
  streamingEnabled?: BoolSetting;
  streamingAutoRetry?: BoolSetting;
  streamingMaxRetries?: string;
  streamingDisabledTypes?: string;
  domainBlockEnabled?: BoolSetting;
  domainBlockList?: string;
  domainBlockUiEnabled?: BoolSetting;
  domainReplaceEnabled?: BoolSetting;
  domainReplaceList?: string;
  domainReplaceUiEnabled?: BoolSetting;
  domainScoreEnabled?: BoolSetting;
  domainScoreList?: string;
  domainScoreUiEnabled?: BoolSetting;
  customCss?: string;
  apiKeySearchEnabled?: BoolSetting;
  apiKeySuggestEnabled?: BoolSetting;
  honeypotEnabled?: BoolSetting;
  honeypotCssCheck?: BoolSetting;
  honeypotBanDuration?: string;
  degoogIndexerEnabled?: BoolSetting;
};

export type ButtonStateHandler = (
  id: string,
  action: () => Promise<void>,
  successKey: string,
  failKey?: string,
) => void;
