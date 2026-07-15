import { SlotPanelPosition, type SlotPanel } from "../../types";

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
    if (el) el.innerHTML = "";
  }
  const glanceEl = document.getElementById("at-a-glance");
  if (glanceEl) glanceEl.innerHTML = "";
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
      const block = document.createElement("div");
      block.className = "results-slot-panel-full-width";
      if (panel.id) block.dataset.slot = panel.id;
      block.innerHTML = panel.html;
      container.appendChild(block);
    } else {
      const block = document.createElement("div");
      block.className =
        "results-slot-panel degoog-panel degoog-panel--slot degoog-panel--stack-item";
      if (panel.id) block.dataset.slot = panel.id;
      const grid = panel.gridSize ?? 4;
      block.dataset.grid = String(grid);
      if (panel.title) {
        const titleEl = document.createElement("div");
        titleEl.className = "results-slot-panel-title degoog-panel--slot-title";
        titleEl.textContent = panel.title;
        block.appendChild(titleEl);
      }
      const body = document.createElement("div");
      body.className =
        "results-slot-panel-body degoog-panel--slot-body degoog-panel--slot-body-padded";
      body.innerHTML = panel.html;
      block.appendChild(body);
      container.appendChild(block);
    }
  }
}

export function renderSlotPanels(panels: SlotPanel[]): void {
  _renderSlotPanelsInto(panels, true);
}

export function appendSlotPanels(panels: SlotPanel[]): void {
  _renderSlotPanelsInto(panels, false);
}
