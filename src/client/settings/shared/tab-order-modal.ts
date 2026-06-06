import { escapeHtml } from "../../utils/dom";
import { getTabOrder, saveTabOrder, applyTabOrder } from "../../utils/tab-order";
import { TAB_ORDER_SAVED } from "../../constants";
import { openCustomModal } from "../../modules/modals/settings-modal/modal";
import type { TypeEntry } from "../../types/engines-tab";

const _renderItem = (entry: TypeEntry): string =>
  `<li class="settings-fieldset settings-fieldset-inverse settings-fieldset--compact" data-key="${escapeHtml(entry.key)}">
    <div class="ext-card-main">
      <span class="ext-card-name">${escapeHtml(entry.label)}</span>
      <div class="degoog-card-order">
        <button class="degoog-icon-btn degoog-card-order-btn" data-dir="up" type="button" title="Move up"><i class="fa-solid fa-chevron-up"></i></button>
        <button class="degoog-icon-btn degoog-card-order-btn" data-dir="down" type="button" title="Move down"><i class="fa-solid fa-chevron-down"></i></button>
      </div>
    </div>
  </li>`;

const _refreshBtns = (list: HTMLElement): void => {
  const items = list.querySelectorAll<HTMLElement>("[data-key]");
  items.forEach((item, i) => {
    const up = item.querySelector<HTMLButtonElement>('[data-dir="up"]');
    const down = item.querySelector<HTMLButtonElement>('[data-dir="down"]');
    if (up) up.disabled = i === 0;
    if (down) down.disabled = i === items.length - 1;
  });
};

const _persist = async (list: HTMLElement, token: string | null): Promise<void> => {
  const order = Array.from(list.querySelectorAll<HTMLElement>("[data-key]"))
    .map((item) => item.dataset.key ?? "")
    .filter(Boolean);
  await saveTabOrder(order, token);
  window.dispatchEvent(new CustomEvent(TAB_ORDER_SAVED));
};

const _bindList = (list: HTMLElement, token: string | null): void => {
  list.querySelectorAll<HTMLButtonElement>(".degoog-card-order-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = btn.closest<HTMLElement>("[data-key]");
      if (!item) return;
      if (btn.dataset.dir === "up") {
        const prev = item.previousElementSibling;
        if (prev) list.insertBefore(item, prev);
      } else {
        const next = item.nextElementSibling;
        if (next) list.insertBefore(next, item);
      }
      _refreshBtns(list);
      void _persist(list, token);
    });
  });
};

export const openTabOrderModal = async (
  types: TypeEntry[],
  token: string | null,
): Promise<void> => {
  const saved = await getTabOrder();
  const orderedKeys = applyTabOrder(types.map((t) => t.key), saved);
  const ordered = orderedKeys
    .map((k) => types.find((t) => t.key === k))
    .filter((t): t is TypeEntry => t !== undefined);

  const bodyHtml = `<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:var(--space-2,0.5rem)">${ordered.map(_renderItem).join("")}</ul>`;

  openCustomModal({ title: "Order tabs", body: bodyHtml });

  const list = document.querySelector<HTMLElement>("#ext-modal-body ul");
  if (list) {
    _bindList(list, token);
    _refreshBtns(list);
  }
};
