import type { StoreItem, StoreItemType } from "../../../types/store-tab";

const t = window.scopedT("core");

const PLUGIN_TYPE_KEYS: Record<string, string> = {
  command: "plugin-type-bang",
  slot: "plugin-type-slot",
  "search-result-tab": "plugin-type-search-tab",
  searchBarAction: "plugin-type-search-bar",
};

const UPPERCASE_SUBTYPES = new Set(["it"]);

const KIND_KEYS: Record<StoreItemType, { one: string; many: string }> = {
  engine: { one: "type-engine", many: "filter-engines" },
  plugin: { one: "type-plugin", many: "filter-plugins" },
  transport: { one: "type-transport", many: "filter-transports" },
  autocomplete: { one: "type-autocomplete", many: "filter-autocomplete" },
  favicon: { one: "type-favicon", many: "filter-favicon" },
  shortcut: { one: "type-shortcut", many: "filter-shortcuts" },
  theme: { one: "type-theme", many: "filter-themes" },
};

export const KIND_ICONS: Record<StoreItemType, string> = {
  engine: "fa-bolt",
  plugin: "fa-puzzle-piece",
  transport: "fa-network-wired",
  autocomplete: "fa-keyboard",
  favicon: "fa-icons",
  shortcut: "fa-arrow-down-a-z",
  theme: "fa-palette",
};

const _capitalise = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, " ");

export const kindLabel = (type: StoreItemType): string =>
  t(`settings-page.store.${KIND_KEYS[type].one}`);

export const kindsLabel = (type: StoreItemType): string =>
  t(`settings-page.store.${KIND_KEYS[type].many}`);

export const subtypeLabel = (type: StoreItemType, sub: string): string => {
  if (type === "plugin" && PLUGIN_TYPE_KEYS[sub])
    return t(`settings-page.store.${PLUGIN_TYPE_KEYS[sub]}`);
  if (UPPERCASE_SUBTYPES.has(sub)) return sub.toUpperCase();
  return _capitalise(sub);
};

export const itemSubLabel = (item: StoreItem): string => {
  const sub =
    item.type === "plugin"
      ? item.pluginType
      : item.type === "engine"
        ? (item.engineType ?? item.engineTypes?.[0])
        : undefined;
  return sub ? subtypeLabel(item.type, sub) : "";
};
