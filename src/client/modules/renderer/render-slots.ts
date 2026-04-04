import { SlotPanelPosition, type SlotPanel } from "../../types";
import { renderTemplate } from "../../utils/template";

const SLOT_IDS = [
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
    [SlotPanelPosition.AboveResults]: document.getElementById("slot-above-results"),
    [SlotPanelPosition.BelowResults]: document.getElementById("slot-below-results"),
    [SlotPanelPosition.AboveSidebar]: document.getElementById("slot-above-sidebar"),
    [SlotPanelPosition.BelowSidebar]: document.getElementById("slot-below-sidebar"),
    [SlotPanelPosition.KnowledgePanel]: null,
    [SlotPanelPosition.AtAGlance]: document.getElementById("at-a-glance"),
  };
  for (const panel of panels) {
    const container = byPosition[panel.position];
    if (!container) continue;
    if (panel.position === SlotPanelPosition.AtAGlance) {
      container.innerHTML = panel.html;
    } else {
      const block = document.createElement("div");
      block.className = "results-slot-panel";
      const grid = panel.gridSize ?? 4;
      block.dataset.grid = String(grid);
      if (panel.title) {
        const titleEl = document.createElement("div");
        titleEl.className = "results-slot-panel-title";
        titleEl.textContent = panel.title;
        block.appendChild(titleEl);
      }
      const body = document.createElement("div");
      body.className = "results-slot-panel-body";
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

export function renderAtAGlance(
  data: {
    snippet: string;
    url: string;
    title: string;
    sources: string[];
  } | null,
): void {
  const container = document.getElementById("at-a-glance");
  if (!container) return;
  if (!data) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = renderTemplate("degoog-at-a-glance", {
    snippet: data.snippet,
    url: data.url,
    title: data.title,
    sources: data.sources,
    sources_text: data.sources.join(", "),
  }) ?? "";
}
