import { renderHtml } from "../../../shared/ui/core/html";
import { TabOrderList } from "./tab-order-list";
import { getTabOrder, saveTabOrder, applyTabOrder } from "../../utils/tab-order";
import { TAB_ORDER_SAVED } from "../../constants";
import { openCustomModal } from "../../modules/modals/settings-modal/modal";
import { initDragOrder } from "../../utils/drag-order";
import type { TypeEntry } from "../../types/engines-tab";

const t = window.scopedT("core");

const _persist = async (list: HTMLElement, token: string | null): Promise<void> => {
  const order = Array.from(list.querySelectorAll<HTMLElement>("[data-key]"))
    .map((item) => item.dataset.key ?? "")
    .filter(Boolean);
  await saveTabOrder(order, token);
  window.dispatchEvent(new CustomEvent(TAB_ORDER_SAVED));
};

export const openTabOrderModal = async (
  types: TypeEntry[],
  token: string | null,
): Promise<void> => {
  const saved = await getTabOrder();
  const orderedKeys = applyTabOrder(types.map((entry) => entry.key), saved);
  const ordered = orderedKeys
    .map((key) => types.find((entry) => entry.key === key))
    .filter((entry): entry is TypeEntry => entry !== undefined);

  const bodyHtml = renderHtml(<TabOrderList entries={ordered} />);

  openCustomModal({ title: t("settings-page.extensions.order-tabs"), body: bodyHtml });

  const list = document.querySelector<HTMLElement>("#ext-modal-body ul");
  if (list) {
    initDragOrder(list, {
      itemSelector: "[data-key]",
      handleSelector: "[data-drag-handle]",
      onReorder: (el) => void _persist(el, token),
    });
  }
};
