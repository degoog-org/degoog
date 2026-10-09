import type { ExtensionMeta } from "./extension";

export type ExtStatusFilter = "all" | "on" | "off";

export interface ExtFilter {
  q: string;
  type: string;
  status: ExtStatusFilter;
  open: boolean;
}

export interface ExtFilterGroup {
  key: string;
  label: string;
  items: ExtensionMeta[];
}

export interface ExtFilterActions {
  setQuery: (value: string) => void;
  clearQuery: () => void;
  setType: (type: string, focus: boolean) => void;
  setStatus: (status: ExtStatusFilter) => void;
  toggleOpen: () => void;
  clear: () => void;
}
