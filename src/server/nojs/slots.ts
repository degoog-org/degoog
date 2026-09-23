import { SlotPanelPosition } from "../../shared/search-types";
import type { ScoredResult, SlotPanel } from "../types";
import { runSlotPlugins } from "../utils/search";
import { renderHtml } from "../../shared/ui/tribute/html";
import { FullWidthSlotPanel } from "../../shared/ui/components/search/full-width-slot-panel";
import {
  DEFAULT_SLOT_GRID,
  SlotPanel as SlotPanelView,
} from "../../shared/ui/components/search/slot-panel";

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
  if (panel.position === SlotPanelPosition.FullWidthAboveResults) {
    return renderHtml(FullWidthSlotPanel({ id: panel.id, html: panel.html }));
  }
  return renderHtml(
    SlotPanelView({
      id: panel.id,
      title: panel.title,
      html: panel.html,
      grid: panel.gridSize ?? DEFAULT_SLOT_GRID,
    }),
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
    byContainer[container] =
      (byContainer[container] ?? "") + _renderPanel(panel);
  }

  return { byContainer, knowledgePanels };
};
