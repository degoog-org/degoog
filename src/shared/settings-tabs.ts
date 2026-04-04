export const SETTINGS_TABS = [
  "general",
  "server",
  "engines",
  "plugins",
  "transports",
  "themes",
  "store",
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];
