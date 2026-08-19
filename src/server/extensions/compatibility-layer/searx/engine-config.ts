import type { SettingField } from "../../../types";
import type { SettingValue } from "../../../utils/plugin-settings";

export const SEARX_OPT_PREFIX = "searxOpt_";

export const SEARX_DEFAULT_OPTION_LABEL = "Engine default";

export enum SearxConfigKind {
  Text = "text",
  Number = "number",
  Bool = "bool",
  List = "list",
}

export interface SearxConfigField {
  name: string;
  kind: SearxConfigKind;
  value: string;
  doc?: string;
  options?: string[];
  required?: boolean;
}

const SECRET_HINTS = ["api_key", "apikey", "token", "secret", "password"];

const ACRONYMS = new Set(["api", "cse", "html", "http", "id", "json", "ttl", "uri", "url"]);

const KIND_TYPES: Record<SearxConfigKind, SettingField["type"]> = {
  [SearxConfigKind.Text]: "text",
  [SearxConfigKind.Number]: "number",
  [SearxConfigKind.Bool]: "toggle",
  [SearxConfigKind.List]: "textarea",
};

const isSecret = (name: string): boolean =>
  SECRET_HINTS.some((hint) => name.toLowerCase().includes(hint));

const cleanDoc = (doc: string): string =>
  doc
    .replace(/:[a-z:]+:`([^`]+)`/g, "$1")
    .replace(/``([^`]*)``/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();

const humanLabel = (name: string): string =>
  name
    .split("_")
    .filter(Boolean)
    .map((word) =>
      ACRONYMS.has(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");

const fieldType = (field: SearxConfigField): SettingField["type"] => {
  if (field.options?.length) return "select";
  if (isSecret(field.name)) return "password";
  return KIND_TYPES[field.kind] ?? "text";
};

const optionLabels = (options: string[]): string[] =>
  options.map((option) => (option === "" ? SEARX_DEFAULT_OPTION_LABEL : option));

export const optionFields = (config: SearxConfigField[]): SettingField[] =>
  config.map((field) => {
    const doc = cleanDoc(field.doc ?? "");
    const options = field.options?.length ? field.options : undefined;
    return {
      key: `${SEARX_OPT_PREFIX}${field.name}`,
      label: humanLabel(field.name),
      type: fieldType(field),
      default: field.value,
      ...(doc ? { description: doc } : {}),
      ...(options ? { options, optionLabels: optionLabels(options) } : {}),
      ...(field.required ? { required: true } : {}),
      ...(isSecret(field.name) ? { secret: true } : {}),
    };
  });

export const overridesFrom = (
  settings: Record<string, SettingValue>,
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (!key.startsWith(SEARX_OPT_PREFIX)) continue;
    const text = Array.isArray(value) ? value.join("\n") : value;
    if (typeof text !== "string" || text === "") continue;
    out[key.slice(SEARX_OPT_PREFIX.length)] = text;
  }
  return out;
};
