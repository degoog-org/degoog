import type { IndexerStats } from "../../../shared/indexer";
import { clear, render } from "../../../shared/ui/tribute/dom";
import { ManageBody } from "./manage-body";
import { ManageRow } from "./manage-row";
import { tr } from "./i18n";
import { deleteRows, fetchRows, MANAGE_PAGE_SIZE } from "./api";

const freshButton = (id: string): HTMLButtonElement | null => {
  const old = document.getElementById(id) as HTMLButtonElement | null;
  if (!old) return null;
  const clone = old.cloneNode(true) as HTMLButtonElement;
  old.replaceWith(clone);
  return clone;
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
  render(<ManageBody types={Object.keys(stats?.byType ?? {})} />, bodyEl);
  statusEl.textContent = "";
  overlay.style.display = "";

  const searchEl = bodyEl.querySelector<HTMLInputElement>(
    "#indexer-manage-search",
  );
  const typeEl = bodyEl.querySelector<HTMLSelectElement>(
    "#indexer-manage-type",
  );
  const tbody = bodyEl.querySelector<HTMLElement>("#indexer-manage-tbody");
  const emptyEl = bodyEl.querySelector<HTMLElement>("#indexer-manage-empty");
  const pageInfo = bodyEl.querySelector<HTMLElement>(
    "#indexer-manage-pageinfo",
  );
  const prevBtn = bodyEl.querySelector<HTMLButtonElement>(
    "#indexer-manage-prev",
  );
  const nextBtn = bodyEl.querySelector<HTMLButtonElement>(
    "#indexer-manage-next",
  );
  const selectAll = bodyEl.querySelector<HTMLInputElement>(
    "#indexer-manage-selectall",
  );

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
    clear(bodyEl);
    if (dirty) onChanged();
  };
  closeBtn?.addEventListener("click", close, { once: true });

  const load = async (): Promise<void> => {
    const data = await fetchRows(q, page, activeType);
    if (!tbody) return;
    if (selectAll) selectAll.checked = false;
    if (!data || data.rows.length === 0) {
      render(<></>, tbody);
      total = data?.total ?? 0;
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = tr("manage-empty");
      }
    } else {
      total = data.total;
      if (emptyEl) emptyEl.hidden = true;
      render(
        <>
          {data.rows.map((row) => (
            <ManageRow key={`${row.engine_type}:${row.id}`} row={row} />
          ))}
        </>,
        tbody,
      );
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
      tbody?.querySelectorAll<HTMLInputElement>(
        ".indexer-manage-check:checked",
      ) ?? [],
    )
      .map((el) => ({
        id: Number(el.value),
        engine_type: el.dataset.type ?? "",
      }))
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
