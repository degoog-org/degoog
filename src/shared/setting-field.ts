import type { FieldOptionsSource } from "./field-options";

type SettingFieldType =
  | "text"
  | "number"
  | "password"
  | "url"
  | "toggle"
  | "textarea"
  | "select"
  | "multiselect"
  | "urllist"
  | "list"
  | "hex"
  | "range"
  | "file"
  | "info";

export interface VisibleWhenMatch {
  key: string;
  equals?: string | string[];
  notEquals?: string | string[];
}

export interface VisibleWhenAnyOf {
  anyOf: VisibleWhenRule[];
}

export type VisibleWhenRule = VisibleWhenMatch | VisibleWhenAnyOf;

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
  visibleWhen?: VisibleWhenRule | VisibleWhenRule[];
  itemSchema?: SettingField[];
  addLabel?: string;
  fieldset?: string;
  min?: string;
  max?: string;
  step?: string;
  accept?: string;
  maxSizeKb?: string;
  minSizeKb?: string;
  optionsFrom?: FieldOptionsSource;
}
