export const SETTINGS_TABS = [
  "general",
  "server",
  "engines",
  "plugins",
  "transports",
  "autocomplete",
  "themes",
  "store",
  "indexer",
  "shortcuts",
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export interface SettingsNavItem {
  id: SettingsTab;
  icon: string;
  hiddenUntilEnabled?: boolean;
}

export const SETTINGS_NAV: readonly SettingsNavItem[] = [
  { id: "general", icon: "fa-gear" },
  { id: "server", icon: "fa-server" },
  { id: "indexer", icon: "fa-database", hiddenUntilEnabled: true },
  { id: "engines", icon: "fa-bolt" },
  { id: "plugins", icon: "fa-puzzle-piece" },
  { id: "transports", icon: "fa-network-wired" },
  { id: "autocomplete", icon: "fa-keyboard" },
  { id: "shortcuts", icon: "fa-arrow-down-a-z" },
  { id: "themes", icon: "fa-palette" },
  { id: "store", icon: "fa-store" },
];
