import { appendSlotPanels } from "../modules/renderer/render-slots";
import { state } from "../state";
import { getBase } from "./base-url";
import { SlotPanelPosition, type ScoredResult, type SlotPanel } from "../types";
import { escapeHtml } from "./dom";
import { isImageSearchType } from "./engines";
import { runScriptsInContainer } from "./search-helpers";

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

export const abortSlotPanels = (): void => {
  if (slotsAbortController) {
    slotsAbortController.abort();
    slotsAbortController = null;
  }
  independentKnowledgePanels = [];
};

const _slotRequestBody = (
  query: string,
  results?: ScoredResult[],
): string => {
  const base = { query: query.trim(), type: state.currentType };
  return JSON.stringify(
    results !== undefined ? { ...base, results } : base,
  );
};

const _renderGlanceHtml = (panels: SlotPanel[], clearIfEmpty: boolean): void => {
  const glanceEl = document.getElementById("at-a-glance");
  if (!glanceEl) return;
  const glancePanels = panels.filter(
    (p) => p.position === SlotPanelPosition.AtAGlance,
  );
  if (glancePanels.length === 0) {
    if (clearIfEmpty) glanceEl.innerHTML = "";
    return;
  }
  const parts: string[] = [];
  for (const panel of glancePanels) {
    const titleHtml = panel.title
      ? `<div class="results-slot-panel-title degoog-panel--slot-title">${escapeHtml(panel.title)}</div>`
      : "";
    parts.push(
      `<div class="results-slot-panel degoog-panel degoog-panel--slot degoog-panel--stack-item">${titleHtml}<div class="results-slot-panel-body degoog-panel--slot-body degoog-panel--slot-body-padded">${panel.html}</div></div>`,
    );
  }
  glanceEl.innerHTML = parts.join("");
  runScriptsInContainer(glanceEl);
};

export async function fetchGlancePanels(
  query: string,
  results?: ScoredResult[],
): Promise<void> {
  if (results !== undefined && results.length === 0) {
    abortGlancePanels();
    const glanceEl = document.getElementById("at-a-glance");
    if (glanceEl) glanceEl.innerHTML = "";
    return;
  }
  if (results === undefined) {
    abortGlancePanels();
    glanceAbortController = new AbortController();
  } else if (!glanceAbortController) {
    glanceAbortController = new AbortController();
  }
  const signal = glanceAbortController!.signal;
  try {
    const res = await fetch(`${getBase()}/api/slots/glance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: _slotRequestBody(query, results),
      signal,
    });
    if (signal.aborted) return;
    const data = (await res.json()) as { panels?: SlotPanel[] };
    if (signal.aborted) return;
    if (_skipSlotPanels(state.currentType)) return;
    _renderGlanceHtml(data.panels ?? [], results !== undefined);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return;
    const glanceEl = document.getElementById("at-a-glance");
    if (glanceEl) glanceEl.innerHTML = "";
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

export const buildCommandGlanceHtml = (cmdData: {
  type: string;
  results?: ScoredResult[];
}): string => {
  if (
    cmdData.type === "engine" &&
    cmdData.results &&
    cmdData.results.length > 0
  ) {
    const top = cmdData.results[0];
    const glance = top.snippet
      ? `<div class="glance-box"><div class="glance-snippet">${escapeHtml(top.snippet)}</div></div>`
      : "";
    return `<div class="command-result">${glance}<p class="natural-command-meta">${cmdData.results.length} results from engine</p></div>`;
  }
  if (cmdData.type === "engine") {
    return `<div class="command-result"><p class="natural-command-meta">${cmdData.results?.length ?? 0} results from engine</p></div>`;
  }
  return "";
};
