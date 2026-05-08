import { jsonHeaders, authHeaders } from "../utils/request";
import { initLightbox } from "./store-lightbox";
import type { RepoInfo, StoreItem } from "../types/store-tab";
import { escapeHtml } from "../utils/dom";
import { getStoreTabHtml } from "./store/store-tab-template";
import {
  confirmRemoveRepo,
  handleAddRepo,
  handleInstall,
  handleRefresh,
  handleRefreshAll,
  handleRemove,
  handleUninstall,
  handleUpdate,
  handleUpdateAll,
} from "./store/store-tab-handlers";
import {
  collectSubtypes,
  engineTypeLabel,
  filterItems,
  normalizeRepoUrl,
  pluginTypeLabel,
  renderItemCard,
  renderRepoList,
} from "./store/store-tab-render";
import { getBase } from "../utils/base-url";

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
      listEl.innerHTML = renderRepoList(
        repos,
        getToken,
        repoStatusByUrl,
        selectedRepoUrl,
      );
      listEl.querySelectorAll<HTMLElement>(".store-repo-item").forEach((el) => {
        el.addEventListener("click", () => {
          const url = el.dataset.url;
          if (!url) return;
          selectedRepoUrl = selectedRepoUrl === url ? null : url;
          render();
        });
      });
    }

    const catalogSection = container.querySelector<HTMLElement>(
      ".store-catalog-section",
    );
    const typeSelect =
      catalogSection?.querySelector<HTMLSelectElement>(".store-filter-type");
    const subtypeSelect = catalogSection?.querySelector<HTMLSelectElement>(
      ".store-filter-subtype",
    );
    const grid = catalogSection?.querySelector<HTMLElement>(
      ".store-catalog-grid",
    );

    if (typeSelect) {
      const typeCounts = {
        all: items.length,
        plugin: items.filter((i) => i.type === "plugin").length,
        theme: items.filter((i) => i.type === "theme").length,
        engine: items.filter((i) => i.type === "engine").length,
        transport: items.filter((i) => i.type === "transport").length,
      };
      typeSelect.innerHTML = [
        { id: "all", label: "All", count: typeCounts.all },
        { id: "plugin", label: "Plugins", count: typeCounts.plugin },
        { id: "theme", label: "Themes", count: typeCounts.theme },
        { id: "engine", label: "Engines", count: typeCounts.engine },
        { id: "transport", label: "Transports", count: typeCounts.transport },
      ]
        .map(
          (t) =>
            `<option value="${escapeHtml(t.id)}" ${typeFilter === t.id ? "selected" : ""}>${escapeHtml(t.label)} (${t.count})</option>`,
        )
        .join("");
      typeSelect.onchange = () => {
        typeFilter = typeSelect.value;
        subtypeFilter = "all";
        render();
      };
    }

    const subtypes = collectSubtypes(items, typeFilter);
    if (subtypeSelect) {
      if (subtypes.length === 0) {
        subtypeSelect.style.display = "none";
        subtypeSelect.innerHTML = "";
      } else {
        subtypeSelect.style.display = "";
        const filteredForType = items.filter((i) => i.type === typeFilter);
        subtypeSelect.innerHTML = [
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
                (typeFilter === "engine" && i.engineType === id),
            ).length,
          })),
        ]
          .map(
            (t) =>
              `<option value="${escapeHtml(t.id)}" ${subtypeFilter === t.id ? "selected" : ""}>${escapeHtml(t.label)} (${t.count})</option>`,
          )
          .join("");
        subtypeSelect.onchange = () => {
          subtypeFilter = subtypeSelect.value;
          render();
        };
      }
    }

    if (grid) {
      const filtered = filterItems(
        items,
        typeFilter,
        subtypeFilter,
        searchQuery,
        selectedRepoUrl,
      );
      grid.innerHTML = filtered
        .map((item) => renderItemCard(item, getToken))
        .join("");
      grid
        .querySelectorAll<HTMLButtonElement>(".store-btn-install")
        .forEach((btn) => {
          btn.addEventListener(
            "click",
            () => void handleInstall(btn, getToken, loadItems, render),
          );
        });
      grid
        .querySelectorAll<HTMLButtonElement>(".store-btn-uninstall")
        .forEach((btn) => {
          btn.addEventListener(
            "click",
            () => void handleUninstall(btn, getToken, loadItems, render),
          );
        });
      grid
        .querySelectorAll<HTMLButtonElement>(".store-btn-update")
        .forEach((btn) => {
          btn.addEventListener(
            "click",
            () => void handleUpdate(btn, getToken, loadItems, render),
          );
        });
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
        const rows = updatable
          .map(
            (i) => `
              <div class="store-updates-row" data-repo-url="${escapeHtml(i.repoUrl)}" data-item-path="${escapeHtml(i.path)}" data-type="${escapeHtml(i.type)}">
                <div class="store-updates-row-info">
                  <span class="store-updates-row-name">${escapeHtml(i.name)}</span>
                  <span class="store-updates-row-meta">${escapeHtml(i.repoName)} · <span class="store-card-version-old">v${escapeHtml(i.installedVersion || "?")}</span> → v${escapeHtml(i.version)}</span>
                </div>
                <button class="btn btn--primary degoog-btn degoog-btn--primary store-btn-update" type="button" data-repo-url="${escapeHtml(i.repoUrl)}" data-item-path="${escapeHtml(i.path)}" data-type="${escapeHtml(i.type)}">Update</button>
              </div>`,
          )
          .join("");
        updatesPanel.innerHTML = `
          <div class="store-updates-header">
            <button class="store-updates-toggle degoog-accordion-toggle" type="button">
              <span>Updates available (${updatable.length})</span>
              <svg class="accordion-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <button class="btn btn--primary degoog-btn degoog-btn--primary store-btn-update-all" type="button">Update all</button>
          </div>
          <div class="store-updates-body degoog-accordion-body degoog-accordion-body--flex">${rows}</div>`;
        updatesPanel
          .querySelector<HTMLButtonElement>(".store-updates-toggle")
          ?.addEventListener("click", () => {
            updatesOpen = !updatesOpen;
            updatesPanel.classList.toggle("open", updatesOpen);
          });
        updatesPanel
          .querySelector<HTMLButtonElement>(".store-btn-update-all")
          ?.addEventListener(
            "click",
            () => void handleUpdateAll(container, getToken, loadItems, render),
          );
        updatesPanel
          .querySelectorAll<HTMLButtonElement>(".store-btn-update")
          .forEach((btn) => {
            btn.addEventListener(
              "click",
              () => void handleUpdate(btn, getToken, loadItems, render),
            );
          });
      }
    }
  }

  container.innerHTML = getStoreTabHtml();

  initLightbox(container, getToken);

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
        getToken,
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

  try {
    await refreshAndRender();
    void (async () => {
      await fetch(`${getBase()}/api/store/repos/refresh`, {
        method: "POST",
        headers: jsonHeaders(getToken),
        body: JSON.stringify({}),
      }).catch(() => {});
      await loadRepos();
      await loadItems();
      await loadReposStatus();
      render();
    })();
  } catch {
    const wrap = container.querySelector<HTMLElement>(".store-repo-list-wrap");
    if (wrap)
      wrap.innerHTML = '<p class="store-empty">Failed to load store.</p>';
  }
}
