export type SettingFieldType =
  | "text"
  | "number"
  | "password"
  | "url"
  | "toggle"
  | "textarea"
  | "select"
  | "urllist";

export interface SettingField {
  key: string;
  label: string;
  type: SettingFieldType;
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
  type: string;
  configurable: boolean;
  settingsSchema: SettingField[];
  settings: Record<string, string | string[]>;
  source?: "builtin" | "plugin";
  extensionDocsAvailable?: boolean;
  defaultEnabled?: boolean;
  defaultFeedUrls?: string[];
  requiresNewerVersion?: boolean;
}

export interface AllExtensions {
  engines: ExtensionMeta[];
  plugins: ExtensionMeta[];
  themes: ExtensionMeta[];
  transports: ExtensionMeta[];
}

export interface SearchBarAction {
  id: string;
  label: string;
  icon?: string;
  type: "navigate" | "bang" | "custom";
  url?: string;
  trigger?: string;
}

export interface Command {
  id: string;
  trigger: string;
  aliases?: string[];
  naturalLanguage?: boolean;
  naturalLanguagePhrases?: string[];
}

export interface EngineRegistry {
  engines: Array<{ id: string; displayName: string; searchType?: string }>;
  defaults?: Record<string, boolean>;
}
