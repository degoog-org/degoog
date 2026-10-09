import { repoKey } from "../model";
import { screenshotUrls } from "../screenshots";
import { SEARCH_ID } from "../render/catalog/filter-bar";
import {
  REPO_FILTER_BUTTON_ID,
  REPO_FILTER_QUERY_ID,
} from "../render/catalog/repo-filter";
import { LIGHTBOX_CLOSE_CLASS } from "../render/lightbox";
import { KIND_TABS_ID } from "../render/catalog/kind-tabs";
import { focusTab } from "../../shared/filter/filter-tabs";
import type {
  StoreActions,
  StoreContext,
  StoreKind,
  StoreView,
} from "../../../types/store-tab";

type ViewActions = Omit<
  StoreActions,
  | "update"
  | "install"
  | "uninstall"
  | "deleteOrphan"
  | "updateAll"
  | "restart"
  | "refreshRepo"
  | "refreshBehind"
  | "refreshAll"
  | "removeRepo"
  | "addRepo"
>;

const REPO_TILE_ATTR = "data-repo";

export const createViewActions = (ctx: StoreContext): ViewActions => {
  const { state } = ctx;
  let lightboxReturn: HTMLElement | null = null;

  const setView = (view: StoreView, scroll = false): void => {
    if (view !== state.view) Object.assign(state, { view, status: "all" });
    window.history.replaceState(null, "", `#${view}`);
    ctx.render();
    if (scroll) ctx.scrollToViews();
  };

  const setKind = (kind: StoreKind, focus = false): void => {
    Object.assign(state, { kind, sub: "" });
    ctx.render();
    if (focus) focusTab(KIND_TABS_ID, kind);
  };

  const setRepoPop = (open: boolean): void => {
    state.repoPopOpen = open;
    if (!open) state.repoPopQ = "";
    ctx.render();
    ctx.focus(`#${open ? REPO_FILTER_QUERY_ID : REPO_FILTER_BUTTON_ID}`);
  };

  const filterRepo = (url: string, view: StoreView): void => {
    Object.assign(state, {
      q: "",
      kind: "all",
      sub: "",
      status: "all",
      repoSel: [repoKey(url)],
    });
    setView(view, true);
  };

  return {
    setView: (view) => setView(view),
    toggleUpdates: () => {
      state.updatesOpen = !state.updatesOpen;
      ctx.render();
    },
    showAllUpdates: () => {
      state.updatesShowAll = true;
      ctx.render();
    },
    manageRepo: (url) => {
      state.expanded = repoKey(url);
      setView("repos");
      document
        .querySelector(`[${REPO_TILE_ATTR}="${CSS.escape(state.expanded)}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    toggleRepo: (url) => {
      const key = repoKey(url);
      state.expanded = state.expanded === key ? "" : key;
      ctx.render();
    },
    browseRepo: (url) => filterRepo(url, "browse"),
    showRepoInstalled: (url) => filterRepo(url, "installed"),
    setAddDraft: (value) => {
      state.addDraft = value;
      if (!state.addError) return;
      state.addError = "";
      ctx.render();
    },
    setQuery: (value) => {
      state.q = value;
      ctx.render();
    },
    clearQuery: () => {
      state.q = "";
      ctx.render();
      ctx.focus(`#${SEARCH_ID}`);
    },
    setKind,
    showKind: (kind) => {
      setKind(kind);
      ctx.scrollToViews();
    },
    setStatus: (status) => {
      state.status = status;
      ctx.render();
    },
    setSub: (sub) => {
      state.sub = sub;
      ctx.render();
    },
    toggleRepoPop: () => setRepoPop(!state.repoPopOpen),
    setRepoPopQuery: (value) => {
      state.repoPopQ = value;
      ctx.render();
    },
    toggleRepoSel: (key, on) => {
      const next = on ? [...state.repoSel, key] : state.repoSel.filter((u) => u !== key);
      state.repoSel = state.repos.map((r) => repoKey(r.url)).filter((u) => next.includes(u));
      ctx.render();
    },
    clearRepoSel: () => {
      state.repoSel = [];
      ctx.render();
    },
    toggleFilters: () => {
      state.filtersOpen = !state.filtersOpen;
      ctx.render();
    },
    clearFilters: () => {
      Object.assign(state, {
        q: "",
        status: "all",
        repoSel: [],
        sub: "",
        repoPopOpen: false,
        repoPopQ: "",
      });
      ctx.render();
    },
    openLightbox: (item) => {
      const urls = screenshotUrls(item);
      if (!urls.length) return;
      lightboxReturn = document.activeElement as HTMLElement | null;
      state.lightbox = { urls, index: 0, name: item.name };
      ctx.render();
      ctx.focus(`.${LIGHTBOX_CLOSE_CLASS}`);
    },
    stepLightbox: (delta) => {
      const box = state.lightbox;
      if (!box) return;
      box.index = (box.index + delta + box.urls.length) % box.urls.length;
      ctx.render();
    },
    closeLightbox: () => {
      if (!state.lightbox) return;
      state.lightbox = null;
      ctx.render();
      if (lightboxReturn?.isConnected) lightboxReturn.focus();
    },
  };
};
