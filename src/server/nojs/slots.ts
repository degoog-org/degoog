import { SlotPanelPosition } from "../../shared/search-types";
import type { ScoredResult, SlotPanel } from "../types";
import { runSlotPlugins } from "../utils/search";
import { escapeAttribute } from "./template";

const PANEL_CLASS =
  "results-slot-panel degoog-panel degoog-panel--slot degoog-panel--stack-item";
const PANEL_TITLE_CLASS = "results-slot-panel-title degoog-panel--slot-title";
const PANEL_BODY_CLASS =
  "results-slot-panel-body degoog-panel--slot-body degoog-panel--slot-body-padded";
const FULL_WIDTH_CLASS = "results-slot-panel-full-width";
const DEFAULT_GRID_SIZE = 4;

export const SLOT_CONTAINER_IDS: Record<string, string> = {
  [SlotPanelPosition.FullWidthAboveResults]: "slot-full-width-above-results",
  [SlotPanelPosition.AboveResults]: "slot-above-results",
  [SlotPanelPosition.BelowResults]: "slot-below-results",
  [SlotPanelPosition.AboveSidebar]: "slot-above-sidebar",
  [SlotPanelPosition.BelowSidebar]: "slot-below-sidebar",
  [SlotPanelPosition.AtAGlance]: "at-a-glance",
};

export interface NojsSlotRender {
  byContainer: Record<string, string>;
  knowledgePanels: SlotPanel[];
}

const _renderPanel = (panel: SlotPanel): string => {
  if (panel.position === SlotPanelPosition.AtAGlance) return panel.html;
  const slotAttr = ` data-slot="${escapeAttribute(panel.id)}"`;
  if (panel.position === SlotPanelPosition.FullWidthAboveResults) {
    return `<div class="${FULL_WIDTH_CLASS}"${slotAttr}>${panel.html}</div>`;
  }
  const grid = panel.gridSize ?? DEFAULT_GRID_SIZE;
  const title = panel.title
    ? `<div class="${PANEL_TITLE_CLASS}">${escapeAttribute(panel.title)}</div>`
    : "";
  return (
    `<div class="${PANEL_CLASS}"${slotAttr} data-grid="${grid}">` +
    title +
    `<div class="${PANEL_BODY_CLASS}">${panel.html}</div>` +
    "</div>"
  );
};

export const renderNojsSlots = async (
  query: string,
  clientIp: string | undefined,
  results: ScoredResult[],
  locale: string,
  searchType: string,
): Promise<NojsSlotRender> => {
  const options = { locale, searchType, nojs: true };
  const instant = await runSlotPlugins(query, clientIp, undefined, options);
  const afterResults = await runSlotPlugins(query, clientIp, results, options);
  const panels = [...instant, ...afterResults];

  const byContainer: Record<string, string> = {};
  const knowledgePanels: SlotPanel[] = [];

  for (const panel of panels) {
    if (panel.position === SlotPanelPosition.KnowledgePanel) {
      knowledgePanels.push(panel);
      continue;
    }
    const container = SLOT_CONTAINER_IDS[panel.position];
    if (!container) continue;
    byContainer[container] = (byContainer[container] ?? "") + _renderPanel(panel);
  }

  return { byContainer, knowledgePanels };
};
