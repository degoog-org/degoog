import { type SlotPanel, SlotPanelPosition } from "../../../shared/search-types";
import { append, clear } from "../../../shared/ui/tribute/dom";
import { FullWidthSlotPanel } from "../../../shared/ui/components/search/full-width-slot-panel";
import {
  DEFAULT_SLOT_GRID,
  SlotPanel as SlotPanelView,
} from "../../../shared/ui/components/search/slot-panel";

const SLOT_IDS = [
  "slot-full-width-above-results",
  "slot-above-results",
  "slot-below-results",
  "slot-above-sidebar",
  "slot-below-sidebar",
];

export function clearSlotPanels(): void {
  for (const id of SLOT_IDS) {
    const el = document.getElementById(id);
    if (el) clear(el);
  }
  const glanceEl = document.getElementById("at-a-glance");
  if (glanceEl) clear(glanceEl);
}

function _renderSlotPanelsInto(panels: SlotPanel[], clearFirst: boolean): void {
  if (!panels || !Array.isArray(panels) || panels.length === 0) return;
  if (clearFirst) clearSlotPanels();
  const byPosition: Record<SlotPanelPosition, HTMLElement | null> = {
    [SlotPanelPosition.FullWidthAboveResults]: document.getElementById(
      "slot-full-width-above-results",
    ),
    [SlotPanelPosition.AboveResults]:
      document.getElementById("slot-above-results"),
    [SlotPanelPosition.BelowResults]:
      document.getElementById("slot-below-results"),
    [SlotPanelPosition.AboveSidebar]:
      document.getElementById("slot-above-sidebar"),
    [SlotPanelPosition.BelowSidebar]:
      document.getElementById("slot-below-sidebar"),
    [SlotPanelPosition.KnowledgePanel]: null,
    [SlotPanelPosition.AtAGlance]: document.getElementById("at-a-glance"),
  };
  for (const panel of panels) {
    const container = byPosition[panel.position];
    if (!container) continue;
    if (panel.position === SlotPanelPosition.AtAGlance) {
      container.innerHTML = panel.html;
    } else if (panel.position === SlotPanelPosition.FullWidthAboveResults) {
      append(FullWidthSlotPanel({ id: panel.id, html: panel.html }), container);
    } else {
      append(
        SlotPanelView({
          id: panel.id,
          title: panel.title,
          html: panel.html,
          grid: panel.gridSize ?? DEFAULT_SLOT_GRID,
        }),
        container,
      );
    }
  }
}

export function renderSlotPanels(panels: SlotPanel[]): void {
  _renderSlotPanelsInto(panels, true);
}

export function appendSlotPanels(panels: SlotPanel[]): void {
  _renderSlotPanelsInto(panels, false);
}
