import { appendSlotPanels } from "../modules/renderer/render-slots";
import { SlotPanelPosition, type ScoredResult, type SlotPanel } from "../types";
import { escapeHtml } from "./dom";
import { runScriptsInContainer } from "./search-helpers";

let glanceAbortController: AbortController | null = null;

export async function fetchGlancePanels(
  query: string,
  results: ScoredResult[],
): Promise<void> {
  if (glanceAbortController) glanceAbortController.abort();
  glanceAbortController = new AbortController();
  const signal = glanceAbortController.signal;
  const glanceEl = document.getElementById("at-a-glance");
  if (!results || results.length === 0) {
    if (glanceEl) glanceEl.innerHTML = "";
    return;
  }
  try {
    const res = await fetch("/api/slots/glance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: query.trim(), results }),
      signal,
    });
    if (signal.aborted) return;
    const data = (await res.json()) as { panels?: SlotPanel[] };
    if (signal.aborted) return;
    if (!glanceEl) return;
    if (data.panels && data.panels.length > 0) {
      const glancePanels = data.panels.filter(
        (p) => p.position === SlotPanelPosition.AtAGlance,
      );
      const parts: string[] = [];
      for (const panel of glancePanels) {
        const titleHtml = panel.title
          ? `<div class="results-slot-panel-title">${escapeHtml(panel.title)}</div>`
          : "";
        parts.push(
          `<div class="results-slot-panel">${titleHtml}<div class="results-slot-panel-body">${panel.html}</div></div>`,
        );
      }
      glanceEl.innerHTML = parts.join("");
      runScriptsInContainer(glanceEl);
    } else {
      if (glanceEl) glanceEl.innerHTML = "";
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return;
    if (glanceEl) glanceEl.innerHTML = "";
  }
}

export async function fetchSlotPanels(
  query: string,
  results?: ScoredResult[],
): Promise<SlotPanel[]> {
  try {
    const res = await fetch("/api/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: query.trim(), results }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { panels?: SlotPanel[] };
    const panels = data.panels ?? [];
    if (panels.length > 0) appendSlotPanels(panels);
    return panels;
  } catch {
    return [];
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
