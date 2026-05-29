import { getBase } from "../utils/base-url";

const t = window.scopedT("core");
const TOKEN_KEY = "degoog-settings-token";
const MANAGE_PAGE_SIZE = 20;

interface IndexerStats {
  totalResults: number;
  totalHits?: number;
  totalUrls?: number;
  totalQueries: number;
  byType: Record<string, number>;
  dbSizeBytes: number;
}

interface HitRow {
  id: number;
  query_norm: string;
  engine_type: string;
  url: string;
  title: string;
  snippet: string;
  last_seen: number;
}

interface RowsResponse {
  rows: HitRow[];
  total: number;
  page: number;
  limit: number;
}

const getToken = (): string | null => sessionStorage.getItem(TOKEN_KEY);

const authHeaders = (extra: Record<string, string> = {}): Record<string, string> => {
  const token = getToken();
  const headers: Record<string, string> = { ...extra };
  if (token) headers["x-settings-token"] = token;
  return headers;
};

const tr = (key: string, vars?: Record<string, string>): string =>
  t(`settings-page.indexer.${key}`, vars);

export const setIndexerNavVisible = (visible: boolean): void => {
  document.querySelectorAll<HTMLElement>("[data-indexer-nav]").forEach((el) => {
    el.style.display = visible ? "" : "none";
  });
  const select = document.getElementById("settings-tab-select");
  let opt = document.getElementById(
    "settings-tab-indexer-option",
  ) as HTMLOptionElement | null;
  if (visible && select && !opt) {
    opt = document.createElement("option");
    opt.id = "settings-tab-indexer-option";
    opt.value = "indexer";
    opt.textContent = t("settings-page.nav.indexer");
    select.appendChild(opt);
  } else if (!visible && opt) {
    opt.remove();
  }
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const renderShell = (container: HTMLElement): void => {
  container.innerHTML = `
    <section
      class="settings-section ext-card degoog-panel degoog-panel--ext-card"
      id="indexer-tab-section"
    >
      <div class="setting-section-heading-wrapper">
        <h2 class="settings-section-heading">${tr("heading")}</h2>
        <div class="floating-section-icon">
          <i class="fa-solid fa-database"></i>
        </div>
      </div>
      <p class="settings-desc">${tr("desc")}</p>

      <p id="indexer-disabled-note" class="settings-desc degoog-indexer-disabled-note" hidden>
        ${tr("disabled")}
      </p>

      <fieldset class="settings-fieldset">
        <fieldset
          class="settings-fieldset settings-fieldset-inverse settings-fieldset--compact"
          id="indexer-public-wrap"
        >
          <label class="settings-toggle-wrap degoog-toggle-wrap">
            <input type="checkbox" id="indexer-public-export" class="settings-toggle" />
            <span class="toggle-slider degoog-toggle"></span>
            <span class="settings-toggle-label">${tr("public-export")}</span>
          </label>
          <p class="settings-desc">${tr("public-export-desc")}</p>
        </fieldset>

        <fieldset
          id="indexer-filters-wrap"
          class="settings-fieldset settings-fieldset-inverse settings-fieldset--compact"
          hidden
        >
          <p class="settings-rate-limit-defaults">${tr("filters-heading")}</p>
          <label class="settings-proxy-urls-label" for="indexer-domain-allowlist">${tr("domain-allowlist")}</label>
          <textarea id="indexer-domain-allowlist" class="settings-proxy-urls degoog-input" rows="3"></textarea>
          <p class="settings-desc">${tr("domain-allowlist-desc")}</p>
          <label class="settings-proxy-urls-label" for="indexer-domain-blocklist">${tr("domain-blocklist")}</label>
          <textarea id="indexer-domain-blocklist" class="settings-proxy-urls degoog-input" rows="3"></textarea>
          <p class="settings-desc">${tr("domain-blocklist-desc")}</p>
          <label class="settings-proxy-urls-label" for="indexer-word-blocklist">${tr("word-blocklist")}</label>
          <textarea id="indexer-word-blocklist" class="settings-proxy-urls degoog-input" rows="3"></textarea>
          <p class="settings-desc">${tr("word-blocklist-desc")}</p>
        </fieldset>

        <fieldset
          id="indexer-storage-wrap"
          class="settings-fieldset settings-fieldset-inverse settings-fieldset--compact degoog-indexer-stats"
          hidden
        >
          <p class="settings-rate-limit-defaults">${tr("storage-heading")}</p>
          <label class="settings-proxy-urls-label" for="indexer-max-per-search">${tr("max-per-search")}</label>
          <input
            type="number"
            id="indexer-max-per-search"
            class="settings-rate-limit-input degoog-input"
            min="0"
            max="500"
            step="1"
          />
          <p class="settings-desc">${tr("max-per-search-desc")}</p>
          <label class="settings-proxy-urls-label" for="indexer-max-urls">${tr("max-urls")}</label>
          <input
            type="number"
            id="indexer-max-urls"
            class="settings-rate-limit-input degoog-input"
            min="0"
            step="1"
          />
          <p class="settings-desc">${tr("max-urls-desc")}</p>
          <label class="settings-proxy-urls-label" for="indexer-max-hits">${tr("max-hits")}</label>
          <input
            type="number"
            id="indexer-max-hits"
            class="settings-rate-limit-input degoog-input"
            min="0"
            step="1"
          />
          <p class="settings-desc">${tr("max-hits-desc")}</p>
          <label class="settings-toggle-wrap degoog-toggle-wrap">
            <input type="checkbox" id="indexer-prune-enabled" class="settings-toggle" />
            <span class="toggle-slider degoog-toggle"></span>
            <span class="settings-toggle-label">${tr("prune-enabled")}</span>
          </label>
          <p class="settings-desc">${tr("prune-enabled-desc")}</p>
          <label class="settings-toggle-wrap degoog-toggle-wrap">
            <input type="checkbox" id="indexer-fuzzy-enabled" class="settings-toggle" />
            <span class="toggle-slider degoog-toggle"></span>
            <span class="settings-toggle-label">${tr("fuzzy-enabled")}</span>
          </label>
          <p class="settings-desc">${tr("fuzzy-enabled-desc")}</p>
          <label class="settings-proxy-urls-label" for="indexer-query-limit">${tr("query-limit")}</label>
          <input
            type="number"
            id="indexer-query-limit"
            class="settings-rate-limit-input degoog-input"
            min="1"
            max="100"
            step="1"
          />
          <p class="settings-desc">${tr("query-limit-desc")}</p>
        </fieldset>

        <div id="indexer-stats-wrap" class="degoog-indexer-stats" hidden>
          <p class="settings-rate-limit-defaults">${tr("stats-heading")}</p>
          <dl class="degoog-stat-grid">
            <div><dt>${tr("total-hits")}</dt><dd id="indexer-stat-hits">0</dd></div>
            <div><dt>${tr("total-urls")}</dt><dd id="indexer-stat-urls">0</dd></div>
            <div><dt>${tr("total-queries")}</dt><dd id="indexer-stat-queries">0</dd></div>
            <div><dt>${tr("db-size")}</dt><dd id="indexer-stat-size">0 B</dd></div>
          </dl>
          <div id="indexer-by-type" class="degoog-stat-grid degoog-stat-grid--types"></div>

          <div class="degoog-action-row degoog-action-row--buttons">
            <button
              type="button"
              class="btn btn--secondary degoog-btn degoog-btn--secondary"
              id="indexer-manage-btn"
            >
              ${tr("manage-btn")}
            </button>
            <button
              type="button"
              class="btn btn--secondary degoog-btn degoog-btn--secondary"
              id="indexer-export-btn"
            >
              ${tr("export-btn")}
            </button>
            <button
              type="button"
              class="btn btn--secondary degoog-btn degoog-btn--secondary"
              id="indexer-clear-btn"
            >
              ${tr("clear-btn")}
            </button>
          </div>
          <p id="indexer-action-status" class="settings-desc"></p>
        </div>
      </fieldset>
    </section>
  `;
};

const fetchStats = async (): Promise<IndexerStats | null> => {
  try {
    const res = await fetch(`${getBase()}/api/indexer/stats`, {
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as IndexerStats;
  } catch {
    return null;
  }
};

const renderStats = (stats: IndexerStats): void => {
  const hitsEl = document.getElementById("indexer-stat-hits");
  const urlsEl = document.getElementById("indexer-stat-urls");
  const queriesEl = document.getElementById("indexer-stat-queries");
  const sizeEl = document.getElementById("indexer-stat-size");
  const hits = stats.totalHits ?? stats.totalResults;
  if (hitsEl) hitsEl.textContent = String(hits);
  if (urlsEl) urlsEl.textContent = String(stats.totalUrls ?? 0);
  if (queriesEl) queriesEl.textContent = String(stats.totalQueries);
  if (sizeEl) sizeEl.textContent = formatBytes(stats.dbSizeBytes);

  const byTypeEl = document.getElementById("indexer-by-type");
  if (byTypeEl) {
    byTypeEl.replaceChildren();
    for (const [type, count] of Object.entries(stats.byType)) {
      const cell = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = type;
      const dd = document.createElement("dd");
      dd.textContent = String(count);
      cell.append(dt, dd);
      byTypeEl.append(cell);
    }
  }
};

const persistIndexerSettings = async (): Promise<boolean> => {
  const val = (id: string): string =>
    (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? "";
  const checked = (id: string): boolean =>
    (document.getElementById(id) as HTMLInputElement | null)?.checked ?? false;
  try {
    const res = await fetch(`${getBase()}/api/settings/general`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        degoogIndexerPublicExport: String(checked("indexer-public-export")),
        degoogIndexerMaxPerSearch: val("indexer-max-per-search") || "30",
        degoogIndexerMaxUrls: val("indexer-max-urls") || "0",
        degoogIndexerMaxHits: val("indexer-max-hits") || "0",
        degoogIndexerPruneEnabled: String(checked("indexer-prune-enabled")),
        degoogIndexerFuzzyEnabled: String(checked("indexer-fuzzy-enabled")),
        degoogIndexerQueryLimit: val("indexer-query-limit") || "30",
        degoogIndexerDomainAllowlist: val("indexer-domain-allowlist"),
        degoogIndexerDomainBlocklist: val("indexer-domain-blocklist"),
        degoogIndexerWordBlocklist: val("indexer-word-blocklist"),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
};

const setActionStatus = (text: string): void => {
  const el = document.getElementById("indexer-action-status");
  if (el) el.textContent = text;
};

const openClearModal = (onCleared: () => void): void => {
  const overlay = document.getElementById("ext-modal-overlay");
  const titleEl = document.getElementById("ext-modal-title");
  const bodyEl = document.getElementById("ext-modal-body");
  const statusEl = document.getElementById("ext-modal-status");
  const saveEl = document.getElementById("ext-modal-save") as HTMLButtonElement | null;
  const closeBtn = document.getElementById("ext-modal-close");
  if (!overlay || !titleEl || !bodyEl || !statusEl || !saveEl) return;

  titleEl.textContent = tr("clear-modal-title");
  bodyEl.innerHTML = `
    <p>${tr("clear-modal-desc")}</p>
    <input type="text" id="indexer-clear-confirm" class="degoog-input" autocomplete="off" />`;
  statusEl.textContent = "";
  saveEl.textContent = tr("clear-confirm");
  saveEl.disabled = false;
  saveEl.hidden = false;
  overlay.style.display = "";

  const close = (): void => {
    overlay.style.display = "none";
    statusEl.textContent = "";
    bodyEl.innerHTML = "";
  };
  closeBtn?.addEventListener("click", close, { once: true });

  saveEl.addEventListener("click", async () => {
    const input = bodyEl.querySelector<HTMLInputElement>("#indexer-clear-confirm");
    if (input?.value.trim() !== "CLEAR") {
      statusEl.textContent = tr("clear-modal-desc");
      return;
    }
    saveEl.disabled = true;
    try {
      const res = await fetch(`${getBase()}/api/indexer/clear`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) {
        statusEl.textContent = "Failed";
        saveEl.disabled = false;
        return;
      }
      close();
      onCleared();
    } catch {
      statusEl.textContent = "Failed";
      saveEl.disabled = false;
    }
  });
};

const MANAGE_BODY = `
  <div class="degoog-manage-filters">
    <input
      type="search"
      id="indexer-manage-search"
      class="degoog-input"
      placeholder=""
    />
    <select id="indexer-manage-type" class="degoog-input degoog-manage-type-select">
      <option value=""></option>
    </select>
  </div>
  <table class="degoog-manage-table">
    <thead>
      <tr>
        <th><input type="checkbox" id="indexer-manage-selectall" /></th>
        <th data-col="query"></th>
        <th data-col="type"></th>
        <th data-col="title"></th>
        <th data-col="actions"></th>
      </tr>
    </thead>
    <tbody id="indexer-manage-tbody"></tbody>
  </table>
  <p id="indexer-manage-empty" class="settings-desc" hidden></p>
  <div class="degoog-action-row degoog-manage-pager">
    <button type="button" class="btn btn--secondary degoog-btn degoog-btn--secondary" id="indexer-manage-prev"></button>
    <span id="indexer-manage-pageinfo" class="settings-desc"></span>
    <button type="button" class="btn btn--secondary degoog-btn degoog-btn--secondary" id="indexer-manage-next"></button>
  </div>
`;

const freshButton = (id: string): HTMLButtonElement | null => {
  const old = document.getElementById(id) as HTMLButtonElement | null;
  if (!old) return null;
  const clone = old.cloneNode(true) as HTMLButtonElement;
  old.replaceWith(clone);
  return clone;
};

const fetchRows = async (q: string, page: number, type?: string): Promise<RowsResponse | null> => {
  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(MANAGE_PAGE_SIZE),
    });
    if (q) params.set("q", q);
    if (type) params.set("type", type);
    const res = await fetch(`${getBase()}/api/indexer/rows?${params.toString()}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as RowsResponse;
  } catch {
    return null;
  }
};

const buildRow = (row: HitRow): HTMLTableRowElement => {
  const tr_ = document.createElement("tr");

  const checkCell = document.createElement("td");
  const check = document.createElement("input");
  check.type = "checkbox";
  check.className = "indexer-manage-check";
  check.value = String(row.id);
  check.dataset.type = row.engine_type;
  checkCell.append(check);

  const queryCell = document.createElement("td");
  queryCell.textContent = row.query_norm;

  const typeCell = document.createElement("td");
  typeCell.textContent = row.engine_type;

  const titleCell = document.createElement("td");
  const link = document.createElement("a");
  link.href = row.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = row.title || row.url;
  titleCell.append(link);

  const actionCell = document.createElement("td");
  const del = document.createElement("button");
  del.type = "button";
  del.className = "degoog-icon-btn indexer-manage-del";
  del.dataset.id = String(row.id);
  del.dataset.type = row.engine_type;
  del.setAttribute("aria-label", tr("manage-delete"));
  del.innerHTML = '<i class="fa-solid fa-trash"></i>';
  actionCell.append(del);

  tr_.append(checkCell, queryCell, typeCell, titleCell, actionCell);
  return tr_;
};

interface DeleteItem {
  id: number;
  engine_type: string;
}

const deleteRows = async (items: DeleteItem[]): Promise<boolean> => {
  if (items.length === 0) return false;
  try {
    const res = await fetch(`${getBase()}/api/indexer/rows/delete`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ items }),
    });
    return res.ok;
  } catch {
    return false;
  }
};

const openManageModal = (stats: IndexerStats | null, onChanged: () => void): void => {
  const overlay = document.getElementById("ext-modal-overlay");
  const titleEl = document.getElementById("ext-modal-title");
  const bodyEl = document.getElementById("ext-modal-body");
  const statusEl = document.getElementById("ext-modal-status");
  if (!overlay || !titleEl || !bodyEl || !statusEl) return;

  titleEl.textContent = tr("manage-title");
  bodyEl.innerHTML = MANAGE_BODY;
  statusEl.textContent = "";
  overlay.style.display = "";

  const searchEl = bodyEl.querySelector<HTMLInputElement>("#indexer-manage-search");
  const typeEl = bodyEl.querySelector<HTMLSelectElement>("#indexer-manage-type");
  const tbody = bodyEl.querySelector<HTMLElement>("#indexer-manage-tbody");
  const emptyEl = bodyEl.querySelector<HTMLElement>("#indexer-manage-empty");
  const pageInfo = bodyEl.querySelector<HTMLElement>("#indexer-manage-pageinfo");
  const prevBtn = bodyEl.querySelector<HTMLButtonElement>("#indexer-manage-prev");
  const nextBtn = bodyEl.querySelector<HTMLButtonElement>("#indexer-manage-next");
  const selectAll = bodyEl.querySelector<HTMLInputElement>("#indexer-manage-selectall");
  const queryHead = bodyEl.querySelector<HTMLElement>('th[data-col="query"]');
  const typeHead = bodyEl.querySelector<HTMLElement>('th[data-col="type"]');
  const titleHead = bodyEl.querySelector<HTMLElement>('th[data-col="title"]');

  if (searchEl) searchEl.placeholder = tr("manage-search-placeholder");
  if (queryHead) queryHead.textContent = tr("manage-col-query");
  if (typeHead) typeHead.textContent = tr("manage-col-type");
  if (titleHead) titleHead.textContent = tr("manage-col-title");
  if (prevBtn) prevBtn.textContent = tr("manage-prev");
  if (nextBtn) nextBtn.textContent = tr("manage-next");

  const knownTypes = Object.keys(stats?.byType ?? {});
  if (typeEl) {
    for (const knownType of knownTypes) {
      const opt = document.createElement("option");
      opt.value = knownType;
      opt.textContent = knownType;
      typeEl.append(opt);
    }
  }

  const saveEl = freshButton("ext-modal-save");
  const closeBtn = freshButton("ext-modal-close");
  if (saveEl) {
    saveEl.textContent = tr("manage-delete-selected");
    saveEl.disabled = false;
    saveEl.hidden = false;
  }

  let page = 1;
  let q = "";
  let activeType: string | undefined;
  let total = 0;
  let dirty = false;

  const close = (): void => {
    overlay.style.display = "none";
    statusEl.textContent = "";
    bodyEl.innerHTML = "";
    if (dirty) onChanged();
  };
  closeBtn?.addEventListener("click", close, { once: true });

  const load = async (): Promise<void> => {
    const data = await fetchRows(q, page, activeType);
    if (!tbody) return;
    tbody.replaceChildren();
    if (selectAll) selectAll.checked = false;
    if (!data || data.rows.length === 0) {
      total = data?.total ?? 0;
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = tr("manage-empty");
      }
    } else {
      total = data.total;
      if (emptyEl) emptyEl.hidden = true;
      for (const row of data.rows) tbody.append(buildRow(row));
    }
    const pages = Math.max(1, Math.ceil(total / MANAGE_PAGE_SIZE));
    if (pageInfo)
      pageInfo.textContent = tr("manage-page", {
        page: String(page),
        pages: String(pages),
      });
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= pages;
  };

  let debounce: ReturnType<typeof setTimeout> | null = null;
  searchEl?.addEventListener("input", () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      q = searchEl.value.trim();
      page = 1;
      void load();
    }, 250);
  });

  typeEl?.addEventListener("change", () => {
    activeType = typeEl.value || undefined;
    page = 1;
    void load();
  });

  prevBtn?.addEventListener("click", () => {
    if (page > 1) {
      page -= 1;
      void load();
    }
  });
  nextBtn?.addEventListener("click", () => {
    page += 1;
    void load();
  });

  selectAll?.addEventListener("change", () => {
    tbody
      ?.querySelectorAll<HTMLInputElement>(".indexer-manage-check")
      .forEach((el) => {
        el.checked = selectAll.checked;
      });
  });

  tbody?.addEventListener("click", async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
      ".indexer-manage-del",
    );
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const engine_type = btn.dataset.type ?? "";
    if (!Number.isInteger(id) || !engine_type) return;
    btn.disabled = true;
    if (await deleteRows([{ id, engine_type }])) {
      dirty = true;
      await load();
    } else {
      btn.disabled = false;
    }
  });

  saveEl?.addEventListener("click", async () => {
    const items = Array.from(
      tbody?.querySelectorAll<HTMLInputElement>(".indexer-manage-check:checked") ?? [],
    )
      .map((el) => ({ id: Number(el.value), engine_type: el.dataset.type ?? "" }))
      .filter((it) => Number.isInteger(it.id) && it.engine_type);
    if (items.length === 0) return;
    saveEl.disabled = true;
    if (await deleteRows(items)) {
      dirty = true;
      await load();
    }
    saveEl.disabled = false;
  });

  void load();
};

const wireToggles = async (
  refreshStats: () => Promise<void>,
): Promise<(isEnabled: boolean) => void> => {
  const res = await fetch(`${getBase()}/api/settings/general`, {
    headers: authHeaders(),
  });
  const settings = res.ok ? ((await res.json()) as Record<string, unknown>) : {};
  const enabled = settings.degoogIndexerEnabled === true || settings.degoogIndexerEnabled === "true";
  const publicExport =
    settings.degoogIndexerPublicExport === true ||
    settings.degoogIndexerPublicExport === "true";

  const publicEl = document.getElementById("indexer-public-export") as HTMLInputElement | null;
  const publicWrap = document.getElementById("indexer-public-wrap");
  const filtersWrap = document.getElementById("indexer-filters-wrap");
  const storageWrap = document.getElementById("indexer-storage-wrap");
  const statsWrap = document.getElementById("indexer-stats-wrap");
  const disabledNote = document.getElementById("indexer-disabled-note");
  const pruneEl = document.getElementById("indexer-prune-enabled") as HTMLInputElement | null;
  const fuzzyEl = document.getElementById("indexer-fuzzy-enabled") as HTMLInputElement | null;
  const maxPerSearchEl = document.getElementById("indexer-max-per-search") as HTMLInputElement | null;
  const maxUrlsEl = document.getElementById("indexer-max-urls") as HTMLInputElement | null;
  const maxHitsEl = document.getElementById("indexer-max-hits") as HTMLInputElement | null;
  const queryLimitEl = document.getElementById("indexer-query-limit") as HTMLInputElement | null;
  const domainAllowEl = document.getElementById("indexer-domain-allowlist") as HTMLTextAreaElement | null;
  const domainBlockEl = document.getElementById("indexer-domain-blocklist") as HTMLTextAreaElement | null;
  const wordBlockEl = document.getElementById("indexer-word-blocklist") as HTMLTextAreaElement | null;

  const str = (key: string, fallback: string): string => {
    const v = settings[key];
    return typeof v === "string" ? v : typeof v === "number" ? String(v) : fallback;
  };
  const bool = (key: string, fallback: boolean): boolean => {
    const v = settings[key];
    if (v === true || v === "true") return true;
    if (v === false || v === "false") return false;
    return fallback;
  };

  const applyVisibility = (isEnabled: boolean): void => {
    setIndexerNavVisible(isEnabled);
    if (filtersWrap) filtersWrap.hidden = !isEnabled;
    if (storageWrap) storageWrap.hidden = !isEnabled;
    if (statsWrap) statsWrap.hidden = !isEnabled;
    if (disabledNote) disabledNote.hidden = isEnabled;
    for (const wrap of [publicWrap, filtersWrap, storageWrap]) {
      wrap?.classList.toggle("degoog-fieldset--disabled", !isEnabled);
    }
    const disable = !isEnabled;
    for (const el of [
      publicEl,
      pruneEl,
      fuzzyEl,
      maxPerSearchEl,
      maxUrlsEl,
      maxHitsEl,
      queryLimitEl,
      domainAllowEl,
      domainBlockEl,
      wordBlockEl,
    ]) {
      if (el) el.disabled = disable;
    }
  };

  if (publicEl) publicEl.checked = publicExport;
  if (pruneEl) pruneEl.checked = bool("degoogIndexerPruneEnabled", true);
  if (fuzzyEl) fuzzyEl.checked = bool("degoogIndexerFuzzyEnabled", true);
  if (maxPerSearchEl) maxPerSearchEl.value = str("degoogIndexerMaxPerSearch", "30");
  if (maxUrlsEl) maxUrlsEl.value = str("degoogIndexerMaxUrls", "0");
  if (maxHitsEl) maxHitsEl.value = str("degoogIndexerMaxHits", "0");
  if (queryLimitEl) queryLimitEl.value = str("degoogIndexerQueryLimit", "30");
  if (domainAllowEl) domainAllowEl.value = str("degoogIndexerDomainAllowlist", "");
  if (domainBlockEl) domainBlockEl.value = str("degoogIndexerDomainBlocklist", "");
  if (wordBlockEl) wordBlockEl.value = str("degoogIndexerWordBlocklist", "");
  applyVisibility(enabled);
  if (enabled) await refreshStats();

  const saveAll = (): void => {
    void persistIndexerSettings().then((ok) => {
      setActionStatus(ok ? "" : tr("save-error"));
    });
  };

  publicEl?.addEventListener("change", saveAll);
  pruneEl?.addEventListener("change", saveAll);
  fuzzyEl?.addEventListener("change", saveAll);
  for (const el of [
    maxPerSearchEl,
    maxUrlsEl,
    maxHitsEl,
    queryLimitEl,
    domainAllowEl,
    domainBlockEl,
    wordBlockEl,
  ]) {
    el?.addEventListener("change", saveAll);
  }

  return applyVisibility;
};

const downloadExportForType = async (type: string): Promise<void> => {
  setActionStatus("");
  try {
    const res = await fetch(`${getBase()}/api/indexer/export?type=${encodeURIComponent(type)}`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setActionStatus(data.error ?? `Download failed (${res.status})`);
      return;
    }
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `degoog-index-${type}.db`;
    a.click();
    URL.revokeObjectURL(href);
  } catch {
    setActionStatus("Download failed");
  }
};

const openExportModal = (stats: IndexerStats | null): void => {
  const types = Object.keys(stats?.byType ?? {});
  if (types.length === 1) {
    void downloadExportForType(types[0]);
    return;
  }

  const overlay = document.getElementById("ext-modal-overlay");
  const titleEl = document.getElementById("ext-modal-title");
  const bodyEl = document.getElementById("ext-modal-body");
  const statusEl = document.getElementById("ext-modal-status");
  const saveEl = document.getElementById("ext-modal-save") as HTMLButtonElement | null;
  const closeBtn = document.getElementById("ext-modal-close");
  if (!overlay || !titleEl || !bodyEl || !statusEl || !saveEl) return;

  titleEl.textContent = tr("export-modal-title");
  bodyEl.innerHTML = `
    <p>${tr("export-modal-desc")}</p>
    <select id="indexer-export-type" class="degoog-input">
      ${types.map((type) => `<option value="${type}">${type}</option>`).join("")}
    </select>`;
  statusEl.textContent = "";
  saveEl.textContent = tr("export-btn");
  saveEl.disabled = false;
  saveEl.hidden = false;
  overlay.style.display = "";

  const close = (): void => {
    overlay.style.display = "none";
    statusEl.textContent = "";
    bodyEl.innerHTML = "";
  };
  closeBtn?.addEventListener("click", close, { once: true });

  saveEl.addEventListener("click", async () => {
    const sel = bodyEl.querySelector<HTMLSelectElement>("#indexer-export-type");
    const type = sel?.value;
    if (!type) return;
    saveEl.disabled = true;
    close();
    await downloadExportForType(type);
  }, { once: true });
};

export const initIndexerTab = async (container: HTMLElement): Promise<void> => {
  renderShell(container);

  let _lastStats: IndexerStats | null = null;

  const refreshStats = async (): Promise<void> => {
    const stats = await fetchStats();
    if (stats) {
      _lastStats = stats;
      renderStats(stats);
    }
  };

  const applyVisibility = await wireToggles(refreshStats);

  const masterEl = document.getElementById(
    "settings-degoog-indexer-enabled",
  ) as HTMLInputElement | null;
  masterEl?.addEventListener("change", () => {
    applyVisibility(masterEl.checked);
    if (masterEl.checked) void refreshStats();
  });

  document
    .getElementById("indexer-manage-btn")
    ?.addEventListener("click", () => openManageModal(_lastStats, refreshStats));

  document
    .getElementById("indexer-export-btn")
    ?.addEventListener("click", () => openExportModal(_lastStats));

  document
    .getElementById("indexer-clear-btn")
    ?.addEventListener("click", () => openClearModal(refreshStats));
};
