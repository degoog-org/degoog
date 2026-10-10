import type { ExtensionMeta } from "../../../types/extension";
import type {
  ExtFilter,
  ExtFilterActions,
  ExtFilterGroup,
} from "../../../types/ext-filter";
import { focusTab } from "./filter-tabs";

export type IsOn = (ext: ExtensionMeta) => boolean;

export const settingsIsOn: IsOn = (ext) => ext.settings["disabled"] !== "true";

export const createExtFilter = (): ExtFilter => ({
  q: "",
  type: "all",
  status: "all",
  open: false,
});

export const isFiltered = (filter: ExtFilter): boolean =>
  !!filter.q.trim() || filter.status !== "all";

const _matchesQuery = (ext: ExtensionMeta, q: string): boolean =>
  !q ||
  [ext.displayName, ext.description, ext.bangShortcut].some(
    (v) => !!v && v.toLowerCase().includes(q),
  );

export const extMatches = (
  ext: ExtensionMeta,
  filter: ExtFilter,
  isOn: IsOn,
  withStatus = true,
): boolean => {
  if (withStatus && filter.status === "on" && !isOn(ext)) return false;
  if (withStatus && filter.status === "off" && isOn(ext)) return false;
  return _matchesQuery(ext, filter.q.trim().toLowerCase());
};

export const filterExtGroups = (
  groups: ExtFilterGroup[],
  filter: ExtFilter,
  isOn: IsOn,
): ExtFilterGroup[] =>
  groups
    .filter((group) => filter.type === "all" || group.key === filter.type)
    .map((group) => ({
      ...group,
      items: group.items.filter((ext) => extMatches(ext, filter, isOn)),
    }))
    .filter((group) => group.items.length > 0);

export const countItems = (groups: ExtFilterGroup[]): number =>
  groups.reduce((n, group) => n + group.items.length, 0);

export const createExtFilterActions = (
  filter: ExtFilter,
  paint: () => void,
  ids: { search: string; tabs: string },
): ExtFilterActions => ({
  setQuery: (value) => {
    filter.q = value;
    paint();
  },
  clearQuery: () => {
    filter.q = "";
    paint();
    document.getElementById(ids.search)?.focus();
  },
  setType: (type, focus) => {
    filter.type = type;
    paint();
    if (focus) focusTab(ids.tabs, type);
  },
  setStatus: (status) => {
    filter.status = status;
    paint();
  },
  toggleOpen: () => {
    filter.open = !filter.open;
    paint();
  },
  clear: () => {
    Object.assign(filter, { q: "", status: "all" });
    paint();
  },
});
