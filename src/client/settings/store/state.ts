import type { StoreState, StoreView } from "../../types/store-tab";

const VIEWS: readonly StoreView[] = ["browse", "installed", "repos"];

const _hashView = (): StoreView => {
  const hash = window.location.hash.slice(1);
  return (VIEWS as readonly string[]).includes(hash) ? (hash as StoreView) : "browse";
};

export const createStoreState = (): StoreState => ({
  repos: [],
  items: [],
  behind: {},
  restartReasons: [],
  view: _hashView(),
  q: "",
  kind: "all",
  sub: "",
  status: "all",
  repoSel: [],
  repoPopOpen: false,
  repoPopQ: "",
  filtersOpen: false,
  updatesOpen: false,
  updatesShowAll: false,
  updatingAll: false,
  busy: new Map(),
  failed: new Map(),
  repoBusy: new Set(),
  repoNotes: new Map(),
  refreshingAll: false,
  expanded: "",
  restarting: false,
  adding: false,
  addDraft: "",
  addError: "",
  repoCols: 1,
  lightbox: null,
});
