import type { HitRow, IndexerStats } from "../../types/indexer";
import { tr } from "./i18n";
import { deleteRows, fetchRows, MANAGE_PAGE_SIZE } from "./api";

const MANAGE_BODY = `
  <div class="degoog-manage-filters">
    <input
      type="search"
      id="indexer-manage-search"
      class="degoog-input"
      placeholder=""
    />
    <select id="indexer-manage-type" class="degoog-input">
      <option value=""></option>
    </select>
  </div>
  <table class="degoog-manage-table">
    <thead>
      <tr>
        <th>
          <label class="degoog-checkbox-wrap">
            <input type="checkbox" id="indexer-manage-selectall" class="settings-toggle" />
            <span class="degoog-checkbox"><i class="fa-solid fa-check"></i></span>
          </label>
        </th>
        <th data-col="query"></th>
        <th data-col="type"></th>
        <th data-col="title"></th>
        <th data-col="score"></th>
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

const buildRow = (row: HitRow): HTMLTableRowElement => {
  const tr_ = document.createElement("tr");

  const checkCell = document.createElement("td");
  const checkWrap = document.createElement("label");
  checkWrap.className = "degoog-checkbox-wrap";
  const check = document.createElement("input");
  check.type = "checkbox";
  check.className = "indexer-manage-check settings-toggle";
  check.value = String(row.id);
  check.dataset.type = row.engine_type;
  check.setAttribute("aria-label", tr("manage-select-row"));
  const checkBox = document.createElement("span");
  checkBox.className = "degoog-checkbox";
  checkBox.innerHTML = '<i class="fa-solid fa-check"></i>';
  checkWrap.append(check, checkBox);
  checkCell.append(checkWrap);

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

  const scoreCell = document.createElement("td");
  scoreCell.className = "degoog-manage-score";
  scoreCell.textContent = Number.isFinite(row.score) ? row.score.toFixed(2) : "-";

  const actionCell = document.createElement("td");
  const del = document.createElement("button");
  del.type = "button";
  del.className = "degoog-icon-btn indexer-manage-del";
  del.dataset.id = String(row.id);
  del.dataset.type = row.engine_type;
  del.setAttribute("aria-label", tr("manage-delete"));
  del.innerHTML = '<i class="fa-solid fa-trash"></i>';
  actionCell.append(del);

  tr_.append(checkCell, queryCell, typeCell, titleCell, scoreCell, actionCell);
  return tr_;
};

export const openManageModal = (
  stats: IndexerStats | null,
  onChanged: () => void,
): void => {
  const overlay = document.getElementById("ext-modal-overlay");
  const titleEl = document.getElementById("ext-modal-title");
  const bodyEl = document.getElementById("ext-modal-body");
  const statusEl = document.getElementById("ext-modal-status");
  if (!overlay || !titleEl || !bodyEl || !statusEl) return;

  const modal = document.getElementById("ext-modal");
  modal?.classList.add("ext-modal--wide");

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
  const scoreHead = bodyEl.querySelector<HTMLElement>('th[data-col="score"]');

  if (searchEl) searchEl.placeholder = tr("manage-search-placeholder");
  if (queryHead) queryHead.textContent = tr("manage-col-query");
  if (typeHead) typeHead.textContent = tr("manage-col-type");
  if (titleHead) titleHead.textContent = tr("manage-col-title");
  if (scoreHead) scoreHead.textContent = tr("manage-col-score");
  if (prevBtn) prevBtn.textContent = tr("manage-prev");
  if (nextBtn) nextBtn.textContent = tr("manage-next");
  selectAll?.setAttribute("aria-label", tr("manage-select-all"));
  if (typeEl?.options[0]) typeEl.options[0].textContent = tr("manage-type-all");

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
    modal?.classList.remove("ext-modal--wide");
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
