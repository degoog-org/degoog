import type { ShortcutBinding, ShortcutKind } from "../../shared/shortcuts";

export interface RepoInfo {
  url: string;
  localPath: string;
  lastFetched: string;
  name: string;
  error?: string;
  repoImage?: string | null;
}

export type StoreItemType =
  | "plugin"
  | "theme"
  | "engine"
  | "transport"
  | "autocomplete"
  | "shortcut"
  | "favicon";

export interface StoreItem {
  path: string;
  repoSlug: string;
  repoUrl: string;
  repoName: string;
  name: string;
  description?: string;
  version: string;
  type: StoreItemType;
  installed: boolean;
  installedVersion?: string;
  updateAvailable?: boolean;
  screenshots: string[];
  author?: { name: string; url?: string } | null;
  pluginType?: string;
  engineType?: string;
  engineTypes?: string[];
  shortcutBinding?: ShortcutBinding;
  shortcutKind?: ShortcutKind;
  minDegoogVersion?: string;
  requiresNewerVersion?: boolean;
  orphaned?: boolean;
  untracked?: boolean;
}

export type StoreView = "browse" | "installed" | "repos";

export type StoreKind = "all" | StoreItemType;

export type StoreStatus =
  | "all"
  | "installed"
  | "available"
  | "updates"
  | "orphaned";

export type StoreBusy =
  | "installing"
  | "updating"
  | "uninstalling"
  | "deleting"
  | "waiting";

export type StoreVerb = "install" | "update" | "uninstall" | "delete";

export interface StoreFailure {
  verb: StoreVerb;
  message: string;
}

export interface RepoNote {
  ok: boolean;
  text: string;
  showInstalled?: boolean;
}

export interface StoreLightbox {
  urls: string[];
  index: number;
  name: string;
}

export interface StoreState {
  repos: RepoInfo[];
  items: StoreItem[];
  behind: Record<string, number>;
  restartReasons: string[];
  view: StoreView;
  q: string;
  kind: StoreKind;
  sub: string;
  status: StoreStatus;
  repoSel: string[];
  repoPopOpen: boolean;
  repoPopQ: string;
  filtersOpen: boolean;
  updatesOpen: boolean;
  updatesShowAll: boolean;
  updatingAll: boolean;
  busy: Map<string, StoreBusy>;
  failed: Map<string, StoreFailure>;
  repoBusy: Set<string>;
  repoNotes: Map<string, RepoNote>;
  refreshingAll: boolean;
  expanded: string;
  restarting: boolean;
  adding: boolean;
  addDraft: string;
  addError: string;
  repoCols: number;
  lightbox: StoreLightbox | null;
}

export interface StoreActions {
  setView: (view: StoreView) => void;
  toggleUpdates: () => void;
  showAllUpdates: () => void;
  updateAll: () => void;
  update: (item: StoreItem) => void;
  install: (item: StoreItem) => void;
  uninstall: (item: StoreItem) => void;
  deleteOrphan: (item: StoreItem) => void;
  restart: () => void;
  refreshRepo: (url: string) => void;
  refreshBehind: () => void;
  refreshAll: () => void;
  manageRepo: (url: string) => void;
  toggleRepo: (url: string) => void;
  browseRepo: (url: string) => void;
  showRepoInstalled: (url: string) => void;
  removeRepo: (url: string) => void;
  addRepo: () => void;
  setAddDraft: (value: string) => void;
  setQuery: (value: string) => void;
  clearQuery: () => void;
  setKind: (kind: StoreKind, focus?: boolean) => void;
  showKind: (kind: StoreKind) => void;
  setStatus: (status: StoreStatus) => void;
  setSub: (sub: string) => void;
  toggleRepoPop: () => void;
  setRepoPopQuery: (value: string) => void;
  toggleRepoSel: (url: string, on: boolean) => void;
  clearRepoSel: () => void;
  toggleFilters: () => void;
  clearFilters: () => void;
  openLightbox: (item: StoreItem) => void;
  stepLightbox: (delta: number) => void;
  closeLightbox: () => void;
}

export interface StoreContext {
  state: StoreState;
  getToken: () => string | null;
  render: () => void;
  reload: () => Promise<void>;
  focus: (selector: string) => void;
  scrollToViews: () => void;
  showRestartNotice: () => void;
}
