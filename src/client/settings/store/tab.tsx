import { jsonHeaders } from "../../utils/net/request";
import { getBase } from "../../utils/net/base-url";
import { render as renderNodes } from "../../../shared/ui/tribute/dom";
import { fetchRestartState } from "../shared/restart-state";
import { fetchBehind, fetchItems, fetchRepos } from "./api";
import { createStoreState } from "./state";
import { StoreRoot } from "./render/store-root";
import { REPO_GRID_ID } from "./render/repos/repo-grid";
import { KIND_TABS_ID } from "./render/catalog/kind-tabs";
import { revealActiveTab } from "../shared/filter/filter-tabs";
import { REPO_FILTER_CLASS } from "./render/catalog/repo-filter";
import { maybeShowRestartNotice } from "./overlays/restart-notice";
import { createViewActions } from "./actions/view-actions";
import {
  deleteOrphan,
  installItem,
  uninstallItem,
  updateAllItems,
  updateItem,
} from "./actions/item-actions";
import {
  addRepo,
  refreshAllRepos,
  refreshBehind,
  refreshRepo,
  removeRepo,
} from "./actions/repo-actions";
import { restartServer } from "./actions/restart";
import { st } from "./format";
import type { StoreActions, StoreContext } from "../../types/store-tab";

const VIEWS_SELECTOR = ".store-views";
const VIEWS_SCROLL_GAP = 8;

const _gridCols = (): number => {
  const grid = document.getElementById(REPO_GRID_ID);
  if (!grid) return 0;
  return getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length;
};

export async function initStoreTab(
  container: HTMLElement,
  getToken: () => string | null,
): Promise<void> {
  if (!container) return;
  const state = createStoreState();
  const isVisible = (): boolean =>
    !!container.closest(".settings-tab-panel")?.classList.contains("active");

  const ctx: StoreContext = {
    state,
    getToken,
    render: () => paint(),
    reload: async () => {
      const [repos, items, behind, restart] = await Promise.all([
        fetchRepos(getToken),
        fetchItems(getToken),
        fetchBehind(getToken),
        fetchRestartState(getToken),
      ]);
      if (repos) state.repos = repos;
      if (items) state.items = items;
      if (behind) state.behind = behind;
      if (restart) state.restartReasons = restart.pending ? restart.reasons : [];
    },
    focus: (selector) => {
      const el = container.querySelector<HTMLElement>(selector);
      el?.focus();
      if (el instanceof HTMLInputElement) el.setSelectionRange(el.value.length, el.value.length);
    },
    scrollToViews: () => {
      const views = container.querySelector(VIEWS_SELECTOR);
      if (!views) return;
      const top = views.getBoundingClientRect().top + window.scrollY - VIEWS_SCROLL_GAP;
      if (window.scrollY > top) window.scrollTo({ top, behavior: "smooth" });
    },
    showRestartNotice: () => {
      void maybeShowRestartNotice(getToken, () => void restartServer(ctx));
    },
  };

  const actions: StoreActions = {
    ...createViewActions(ctx),
    install: (item) => void installItem(ctx, item),
    update: (item) => void updateItem(ctx, item),
    uninstall: (item) => void uninstallItem(ctx, item),
    deleteOrphan: (item) => void deleteOrphan(ctx, item),
    updateAll: () => void updateAllItems(ctx),
    restart: () => void restartServer(ctx),
    refreshRepo: (url) => void refreshRepo(ctx, url),
    refreshBehind: () => refreshBehind(ctx),
    refreshAll: () => void refreshAllRepos(ctx),
    removeRepo: (url) => void removeRepo(ctx, url),
    addRepo: () => void addRepo(ctx),
  };

  function paint(): void {
    renderNodes(<StoreRoot state={state} actions={actions} />, container);
    revealActiveTab(KIND_TABS_ID);
    const cols = _gridCols();
    if (cols && cols !== state.repoCols) {
      state.repoCols = cols;
      paint();
    }
  }

  new ResizeObserver(() => {
    if (_gridCols() !== state.repoCols) paint();
  }).observe(container);

  document.addEventListener("keydown", (e) => {
    if (!isVisible()) return;
    if (state.lightbox) {
      if (e.key === "ArrowLeft") actions.stepLightbox(-1);
      if (e.key === "ArrowRight") actions.stepLightbox(1);
      if (e.key === "Escape") actions.closeLightbox();
      return;
    }
    if (e.key === "Escape" && state.repoPopOpen) actions.toggleRepoPop();
  });

  document.addEventListener("pointerdown", (e) => {
    if (!state.repoPopOpen) return;
    if ((e.target as Element).closest(`.${REPO_FILTER_CLASS}`)) return;
    Object.assign(state, { repoPopOpen: false, repoPopQ: "" });
    paint();
  });

  const noticeIfVisible = (): void => {
    if (isVisible()) ctx.showRestartNotice();
  };
  window.addEventListener("settings-tab-changed", noticeIfVisible);
  noticeIfVisible();

  let remoteRefreshed = false;
  const refreshRemoteIfVisible = async (): Promise<void> => {
    if (remoteRefreshed || !isVisible()) return;
    remoteRefreshed = true;
    await fetch(`${getBase()}/api/store/repos/refresh`, {
      method: "POST",
      headers: jsonHeaders(getToken),
      body: JSON.stringify({}),
    }).catch((err) => console.debug("[store] background refresh failed", err));
    await ctx.reload();
    paint();
  };

  try {
    await ctx.reload();
    paint();
    window.addEventListener("settings-tab-changed", () => void refreshRemoteIfVisible());
    void refreshRemoteIfVisible();
  } catch (err) {
    console.warn("[store] load failed", err);
    container.textContent = st("failed-load-store");
  }
}
