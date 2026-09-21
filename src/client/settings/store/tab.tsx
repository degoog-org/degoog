import { jsonHeaders, authHeaders } from "../../utils/request";
import type { RepoInfo, StoreItem } from "../../types/store-tab";
import { render as renderNodes } from "../../../shared/ui/core/dom";
import { FilterOptions } from "./filter-options";
import { RepoErrors } from "./repo-errors";
import { StoreEmpty } from "./store-empty";
import { UpdatesPanel } from "./updates-panel";
import { getBase } from "../../utils/base-url";
import { initLightbox } from "./lightbox";
import { maybeShowRestartNotice } from "./restart-notice";
import { getStoreTabHtml } from "./template";
import {
  confirmRemoveRepo,
  handleAddRepo,
  handleDeleteUntracked,
  handleInstall,
  handleRefresh,
  handleRefreshAll,
  handleRemove,
  handleUninstall,
  handleUpdate,
  handleUpdateAll,
} from "./handlers";
import {
  collectSubtypes,
  engineTypeLabel,
  filterItems,
  normalizeRepoUrl,
  pluginTypeLabel,
  ItemCard,
  RepoList,
} from "./render";

export async function initStoreTab(
  container: HTMLElement,
  getToken: () => string | null,
): Promise<void> {
  if (!container) return;

  let repos: RepoInfo[] = [];
  let items: StoreItem[] = [];
  let repoStatusByUrl: Record<string, number> = {};
  let selectedRepoUrl: string | null = null;
  let typeFilter = "all";
  let subtypeFilter = "all";
  let installedFilter = "all";
  let searchQuery = "";
  let updatesOpen = false;

  async function loadRepos(): Promise<void> {
    const res = await fetch(`${getBase()}/api/store/repos`, {
      headers: authHeaders(getToken),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { repos?: RepoInfo[] };
    repos = data.repos || [];
  }

  async function loadReposStatus(): Promise<void> {
    const res = await fetch(`${getBase()}/api/store/repos/status`, {
      headers: authHeaders(getToken),
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      statuses?: Array<{ url: string; behind: number }>;
    };
    const statuses = data.statuses || [];
    const map: Record<string, number> = {};
    for (const s of statuses) {
      map[normalizeRepoUrl(s.url)] = s.behind;
      map[s.url] = s.behind;
    }
    repoStatusByUrl = map;
  }

  async function loadItems(): Promise<void> {
    const res = await fetch(`${getBase()}/api/store/items`, {
      headers: authHeaders(getToken),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { items?: StoreItem[] };
    items = data.items || [];
  }

  async function refreshAndRender(): Promise<void> {
    await loadRepos();
    await loadItems();
    render();
  }

  function render(): void {
    const repoSection = container.querySelector<HTMLElement>(
      ".store-repos-section",
    );
    const listEl = repoSection?.querySelector<HTMLElement>(
      ".store-repo-list-wrap",
    );
    if (listEl) {
      renderNodes(
        <RepoList
          repos={repos}
          statusByUrl={repoStatusByUrl}
          selectedUrl={selectedRepoUrl}
          onSelect={(url) => {
            selectedRepoUrl = selectedRepoUrl === url ? null : url;
            render();
          }}
        />,
        listEl,
      );
    }

    const repoErrorsEl = repoSection?.querySelector<HTMLElement>(".store-repo-errors");
    if (repoErrorsEl) {
      const errored = repos.filter((r) => r.error);
      if (errored.length > 0) {
        renderNodes(<RepoErrors repos={errored} />, repoErrorsEl);
        repoErrorsEl.style.display = "";
      } else {
        repoErrorsEl.textContent = "";
        repoErrorsEl.style.display = "none";
      }
    }

    const catalogSection = container.querySelector<HTMLElement>(
      ".store-catalog-section",
    );
    const typeSelect =
      catalogSection?.querySelector<HTMLSelectElement>(".store-filter-type");
    const subtypeSelect = catalogSection?.querySelector<HTMLSelectElement>(
      ".store-filter-subtype",
    );
    const statusSelect = catalogSection?.querySelector<HTMLSelectElement>(
      ".store-filter-status",
    );
    const grid = catalogSection?.querySelector<HTMLElement>(
      ".store-catalog-grid",
    );

    const scopedItems = selectedRepoUrl ? items.filter((i) => normalizeRepoUrl(i.repoUrl) === normalizeRepoUrl(selectedRepoUrl ?? "")) : items;

    if (typeSelect) {
      const typeCounts = {
        all: scopedItems.length,
        plugin: scopedItems.filter((i) => i.type === "plugin").length,
        theme: scopedItems.filter((i) => i.type === "theme").length,
        engine: scopedItems.filter((i) => i.type === "engine").length,
        transport: scopedItems.filter((i) => i.type === "transport").length,
        autocomplete: scopedItems.filter((i) => i.type === "autocomplete").length,
        shortcut: scopedItems.filter((i) => i.type === "shortcut").length,
      };
      renderNodes(
        <FilterOptions
          selected={typeFilter}
          options={[
            { id: "all", label: "Extensions", count: typeCounts.all },
            { id: "plugin", label: "Plugins", count: typeCounts.plugin },
            { id: "theme", label: "Themes", count: typeCounts.theme },
            { id: "engine", label: "Engines", count: typeCounts.engine },
            { id: "transport", label: "Transports", count: typeCounts.transport },
            { id: "autocomplete", label: "Autocomplete", count: typeCounts.autocomplete },
            { id: "shortcut", label: "Shortcuts", count: typeCounts.shortcut },
          ]}
        />,
        typeSelect,
      );
      typeSelect.onchange = () => {
        typeFilter = typeSelect.value;
        subtypeFilter = "all";
        render();
      };
    }

    const subtypes = collectSubtypes(scopedItems, typeFilter);
    if (subtypeSelect) {
      if (subtypes.length === 0) {
        subtypeSelect.style.display = "none";
        subtypeSelect.innerHTML = "";
      } else {
        subtypeSelect.style.display = "";
        const filteredForType = (scopedItems).filter((i) => i.type === typeFilter);
        renderNodes(
          <FilterOptions
            selected={subtypeFilter}
            options={[
              { id: "all", label: "All", count: filteredForType.length },
              ...subtypes.map((id) => ({
                id,
                label:
                  typeFilter === "plugin"
                    ? pluginTypeLabel(id)
                    : engineTypeLabel(id),
                count: filteredForType.filter(
                  (i) =>
                    (typeFilter === "plugin" && i.pluginType === id) ||
                    (typeFilter === "engine" && (i.engineTypes ?? (i.engineType ? [i.engineType] : [])).includes(id)),
                ).length,
              })),
            ]}
          />,
          subtypeSelect,
        );
        subtypeSelect.onchange = () => {
          subtypeFilter = subtypeSelect.value;
          render();
        };
      }
    }

    if (statusSelect) {
      const installed = scopedItems.filter((i) => i.installed).length;
      renderNodes(
        <FilterOptions
          selected={installedFilter}
          options={[
            { id: "all", label: "All", count: scopedItems.length },
            { id: "installed", label: "Installed", count: installed },
            { id: "not-installed", label: "Not Installed", count: scopedItems.length - installed },
          ]}
        />,
        statusSelect,
      );
      statusSelect.onchange = () => {
        installedFilter = statusSelect.value;
        render();
      };
    }

    if (grid) {
      const filtered = filterItems(items, typeFilter, subtypeFilter, searchQuery, selectedRepoUrl, installedFilter);
      renderNodes(
        <>
          {filtered.map((item) => (
            <ItemCard
              key={`${item.repoUrl}::${item.path}::${item.type}`}
              item={item}
            />
          ))}
        </>,
        grid,
      );
    }

    const updatesPanel = container.querySelector<HTMLElement>(
      ".store-updates-panel",
    );
    const updatable = items.filter((i) => i.updateAvailable);
    if (updatesPanel) {
      if (updatable.length === 0) {
        updatesPanel.style.display = "none";
        updatesPanel.innerHTML = "";
      } else {
        updatesPanel.style.display = "";
        updatesPanel.classList.toggle("open", updatesOpen);
        renderNodes(
          <UpdatesPanel
            items={updatable}
            onToggle={() => {
              updatesOpen = !updatesOpen;
              updatesPanel.classList.toggle("open", updatesOpen);
            }}
            onUpdateAll={() =>
              void handleUpdateAll(container, getToken, loadItems, render)
            }
            onUpdate={(button) =>
              void handleUpdate(container, button, getToken, loadItems, render)
            }
          />,
          updatesPanel,
        );
      }
    }
  }

  container.innerHTML = getStoreTabHtml();

  container.querySelector<HTMLElement>(".store-catalog-grid")?.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const installBtn = t.closest<HTMLButtonElement>(".store-btn-install");
    const uninstallBtn = t.closest<HTMLButtonElement>(".store-btn-uninstall");
    const updateBtn = t.closest<HTMLButtonElement>(".store-btn-update");
    const deleteBtn = t.closest<HTMLButtonElement>(".store-btn-delete");
    if (installBtn) void handleInstall(container, installBtn, getToken, loadItems, render);
    if (uninstallBtn) void handleUninstall(uninstallBtn, getToken, loadItems, render);
    if (updateBtn) void handleUpdate(container, updateBtn, getToken, loadItems, render);
    if (deleteBtn) {
      if (deleteBtn.dataset.untracked === "true")
        void handleDeleteUntracked(deleteBtn, getToken, loadItems, render);
      else
        void handleUninstall(deleteBtn, getToken, loadItems, render);
    }
  });

  initLightbox(container);

  const addWrap = container.querySelector<HTMLElement>(".store-add-repo-wrap");
  const addBtn = container.querySelector<HTMLButtonElement>(".store-btn-add");
  const addConfirmBtn = container.querySelector<HTMLButtonElement>(
    ".store-btn-add-confirm",
  );
  const urlInput =
    container.querySelector<HTMLInputElement>(".store-input-url");
  const addErrorEl = container.querySelector<HTMLElement>(
    ".store-inline-error",
  );

  addBtn?.addEventListener("click", () => {
    if (addWrap)
      addWrap.style.display =
        addWrap.style.display === "none" ? "flex" : "none";
  });
  addConfirmBtn?.addEventListener("click", () => {
    if (addConfirmBtn)
      void handleAddRepo(
        urlInput,
        addConfirmBtn,
        addErrorEl,
        getToken,
        refreshAndRender,
      );
  });

  container
    .querySelector<HTMLButtonElement>(".store-btn-refresh-all")
    ?.addEventListener("click", async () => {
      await handleRefreshAll(
        container,
        refreshAndRender,
        loadReposStatus,
        render,
      );
    });

  container.addEventListener("click", async (e) => {
    const refreshBtn = (e.target as HTMLElement).closest<HTMLElement>(
      ".store-btn-refresh",
    );
    const removeBtn = (e.target as HTMLElement).closest<HTMLElement>(
      ".store-btn-remove",
    );
    if (refreshBtn?.dataset.url)
      void handleRefresh(
        container,
        refreshBtn.dataset.url,
        getToken,
        refreshAndRender,
        loadReposStatus,
        render,
      );
    if (removeBtn?.dataset.url) {
      const ok = await confirmRemoveRepo(removeBtn.dataset.url);
      if (ok)
        void handleRemove(
          removeBtn.dataset.url,
          repos,
          getToken,
          refreshAndRender,
        );
    }
  });

  const searchInput = container.querySelector<HTMLInputElement>(
    "#store-search-input",
  );
  searchInput?.addEventListener("input", () => {
    searchQuery = searchInput?.value || "";
    render();
  });

  const noticeIfVisible = (): void => {
    if (container.closest(".settings-tab-panel")?.classList.contains("active"))
      void maybeShowRestartNotice(getToken);
  };
  window.addEventListener("settings-tab-changed", noticeIfVisible);
  noticeIfVisible();

  try {
    await refreshAndRender();
    void (async () => {
      await fetch(`${getBase()}/api/store/repos/refresh`, {
        method: "POST",
        headers: jsonHeaders(getToken),
        body: JSON.stringify({}),
      }).catch(() => { });
      await loadRepos();
      await loadItems();
      await loadReposStatus();
      render();
    })();
  } catch {
    const wrap = container.querySelector<HTMLElement>(".store-repo-list-wrap");
    if (wrap) renderNodes(<StoreEmpty message="Failed to load store." />, wrap);
  }
}
