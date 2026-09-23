import { CommandGlance } from "./search/command-glance";
import { appendSlotPanels } from "../modules/renderer/render-slots";
import { state } from "../state";
import { getBase } from "./base-url";
import { clear, render } from "../../shared/ui/tribute/dom";
import { SlotPanel as SlotPanelView } from "../../shared/ui/components/search/slot-panel";
import {
  isImageSearchType,
  type ScoredResult,
  type SlotPanel,
  SlotPanelPosition,
} from "../../shared/search-types";
import { runScriptsInContainer } from "./search-helpers";
import { SkeletonGlance } from "../animations/skeleton/skeleton-glance";

let glanceAbortController: AbortController | null = null;
let slotsAbortController: AbortController | null = null;
let independentKnowledgePanels: SlotPanel[] = [];

const _skipSlotPanels = (type: string): boolean => isImageSearchType(type);

const _knowledgePanels = (panels: SlotPanel[]): SlotPanel[] =>
  panels.filter((p) => p.position === SlotPanelPosition.KnowledgePanel);

const _mergeKnowledgePanels = (panels: SlotPanel[]): SlotPanel[] => {
  const dependent = _knowledgePanels(panels);
  const seen = new Set(dependent.map((p) => p.id));
  return [
    ...independentKnowledgePanels.filter((p) => !seen.has(p.id)),
    ...dependent,
  ];
};

export const abortGlancePanels = (): void => {
  if (glanceAbortController) {
    glanceAbortController.abort();
    glanceAbortController = null;
  }
};

export const abortSlotFetch = (): void => {
  if (slotsAbortController) {
    slotsAbortController.abort();
    slotsAbortController = null;
  }
};

export const abortSlotPanels = (): void => {
  abortSlotFetch();
  independentKnowledgePanels = [];
};

const _slotRequestBody = (query: string, results?: ScoredResult[]): string => {
  const base = { query: query.trim(), type: state.currentType };
  return JSON.stringify(results !== undefined ? { ...base, results } : base);
};

const _renderGlanceHtml = (
  panels: SlotPanel[],
  clearIfEmpty: boolean,
): void => {
  const glanceEl = document.getElementById("at-a-glance");
  if (!glanceEl) return;
  const glancePanels = panels.filter(
    (p) => p.position === SlotPanelPosition.AtAGlance,
  );
  if (glancePanels.length === 0) {
    if (clearIfEmpty) clear(glanceEl);
    return;
  }
  clear(glanceEl);
  render(
    glancePanels.map((panel) =>
      SlotPanelView({ title: panel.title, html: panel.html }),
    ),
    glanceEl,
  );
  runScriptsInContainer(glanceEl);
};

export async function fetchGlancePanels(
  query: string,
  results?: ScoredResult[],
): Promise<void> {
  if (results !== undefined && results.length === 0) {
    abortGlancePanels();
    const glanceEl = document.getElementById("at-a-glance");
    if (glanceEl) clear(glanceEl);
    return;
  }
  abortGlancePanels();
  glanceAbortController = new AbortController();
  const signal = glanceAbortController!.signal;
  try {
    const res = await fetch(`${getBase()}/api/slots/glance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: _slotRequestBody(query, results),
      signal,
    });
    if (signal.aborted) return;
    const data = (await res.json()) as {
      panels?: SlotPanel[];
      pending?: boolean;
    };
    if (signal.aborted) return;
    if (_skipSlotPanels(state.currentType)) return;
    const panels = data.panels ?? [];
    if (results === undefined && panels.length === 0 && data.pending) {
      const glanceEl = document.getElementById("at-a-glance");
      if (glanceEl) render(<SkeletonGlance />, glanceEl);
      return;
    }
    _renderGlanceHtml(panels, results !== undefined);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return;
    const glanceEl = document.getElementById("at-a-glance");
    if (glanceEl) clear(glanceEl);
  }
}

export async function fetchSlotPanels(
  query: string,
  results?: ScoredResult[],
): Promise<SlotPanel[]> {
  if (results === undefined) {
    abortSlotPanels();
    slotsAbortController = new AbortController();
  } else if (!slotsAbortController) {
    slotsAbortController = new AbortController();
  }
  const signal = slotsAbortController!.signal;
  try {
    const res = await fetch(`${getBase()}/api/slots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: _slotRequestBody(query, results),
      signal,
    });
    if (signal.aborted) return [];
    if (!res.ok) return [];
    const data = (await res.json()) as { panels?: SlotPanel[] };
    if (signal.aborted) return [];
    if (_skipSlotPanels(state.currentType)) return [];
    const panels = data.panels ?? [];
    if (results === undefined) {
      independentKnowledgePanels = _knowledgePanels(panels);
      if (panels.length > 0) appendSlotPanels(panels);
      return panels;
    }
    const merged = _mergeKnowledgePanels(panels);
    if (panels.length > 0) appendSlotPanels(panels);
    return merged;
  } catch {
    return results === undefined ? [] : _mergeKnowledgePanels([]);
  }
}

export const buildCommandGlance = (cmdData: {
  type: string;
  results?: ScoredResult[];
}): JSX.Element | null => {
  if (cmdData.type !== "engine") return null;
  if (cmdData.results && cmdData.results.length > 0) {
    return (
      <CommandGlance
        snippet={cmdData.results[0].snippet}
        resultCount={cmdData.results.length}
      />
    );
  }
  return <CommandGlance resultCount={cmdData.results?.length ?? 0} />;
};
