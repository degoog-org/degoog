import { type SlotPanel, SlotPanelPosition } from "../../../shared/search-types";
import type { OrderedSlotPanel } from "../../../shared/slot-stream";
import { append, clear } from "../../../shared/ui/tribute/dom";
import { FullWidthSlotPanel } from "../../../shared/ui/components/search/full-width-slot-panel";
import {
  DEFAULT_SLOT_GRID,
  SlotPanel as SlotPanelView,
} from "../../../shared/ui/components/search/slot-panel";

export const SLOT_ORDER_ATTR = "data-slot-order";

const SLOT_CONTAINER_IDS: Partial<Record<SlotPanelPosition, string>> = {
  [SlotPanelPosition.FullWidthAboveResults]: "slot-full-width-above-results",
  [SlotPanelPosition.AboveResults]: "slot-above-results",
  [SlotPanelPosition.BelowResults]: "slot-below-results",
  [SlotPanelPosition.AboveSidebar]: "slot-above-sidebar",
  [SlotPanelPosition.BelowSidebar]: "slot-below-sidebar",
};

export function clearSlotPanels(): void {
  for (const id of Object.values(SLOT_CONTAINER_IDS)) {
    const el = document.getElementById(id);
    if (el) clear(el);
  }
  const glanceEl = document.getElementById("at-a-glance");
  if (glanceEl) clear(glanceEl);
}

const _orderOf = (el: Element): number | null => {
  const raw = el.getAttribute(SLOT_ORDER_ATTR);
  return raw === null ? null : Number(raw);
};

export const orderedChildren = (container: Element): Element[] =>
  Array.from(container.children).filter((child) => _orderOf(child) !== null);

export const firstUnordered = (container: Element): Element | null =>
  Array.from(container.children).find((child) => _orderOf(child) === null) ??
  null;

export const placeByOrder = (
  container: Element,
  node: JSX.Element,
  order: number,
): Element | null => {
  const holder = document.createElement("div");
  append(node, holder);
  const placed = holder.firstElementChild;
  if (!placed) return null;
  placed.setAttribute(SLOT_ORDER_ATTR, String(order));
  const anchor =
    Array.from(container.children).find((child) => {
      const childOrder = _orderOf(child);
      return childOrder === null || childOrder >= order;
    }) ?? null;
  container.insertBefore(placed, anchor);
  if (anchor && _orderOf(anchor) === order) container.removeChild(anchor);
  return placed;
};

const _panelView = (panel: SlotPanel): JSX.Element =>
  panel.position === SlotPanelPosition.FullWidthAboveResults
    ? FullWidthSlotPanel({ id: panel.id, html: panel.html })
    : SlotPanelView({
        id: panel.id,
        title: panel.title,
        html: panel.html,
        grid: panel.gridSize ?? DEFAULT_SLOT_GRID,
      });

export function placeSlotPanel(panel: OrderedSlotPanel): void {
  const id = SLOT_CONTAINER_IDS[panel.position];
  const container = id ? document.getElementById(id) : null;
  if (container) placeByOrder(container, _panelView(panel), panel.order);
}
