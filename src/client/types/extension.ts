import type { EngineFilters } from "../../shared/engine-filters";

export type SettingFieldType =
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

export interface SettingField {
  key: string;
  label: string;
  type: SettingFieldType;
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

export interface ExtensionMeta {
  id: string;
  displayName: string;
  description: string;
  primaryType?: string;
  searchTypes?: string[];
  type: string;
  trigger?: string;
  configurable: boolean;
  settingsSchema: SettingField[];
  settings: Record<string, string | string[]>;
  source?: "builtin" | "plugin";
  extensionDocsAvailable?: boolean;
  defaultEnabled?: boolean;
  defaultFeedUrls?: string[];
  isClientExposed?: boolean;
  requiresNewerVersion?: boolean;
  needsAppRestart?: boolean;
}

export interface AllExtensions {
  engines: ExtensionMeta[];
  plugins: ExtensionMeta[];
  themes: ExtensionMeta[];
  transports: ExtensionMeta[];
  autocomplete: ExtensionMeta[];
  shortcuts: ExtensionMeta[];
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
  engines: Array<{
    id: string;
    displayName: string;
    primaryType: string;
    searchTypes: string[];
    disabledByDefault?: boolean;
    filters?: EngineFilters;
  }>;
  defaults?: Record<string, boolean>;
}
