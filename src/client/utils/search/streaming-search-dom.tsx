import { render } from "../../../shared/ui/tribute/dom";
import { StreamingEnginePanel } from "./streaming-engine-panel";
import { StreamingStatRow } from "./streaming-stat-row";
import { state } from "../../state";
import {
  DEGOOG_ENGINE_NAME,
  type EngineTiming,
  type ScoredResult,
} from "../../../shared/search-types";
import { renderTemplate } from "../template";
import { buildResultContext } from "../../modules/renderer/render";
import { engineCount } from "./engine-failure";
import { originSlot, paintOrigins } from "./engine-origins";
import { PANEL_LAYOUT_BREAKPOINT } from "../../modules/renderer/render-media";

const t = window.scopedT("themes/degoog");

export function renderResultEl(
  r: ScoredResult,
  index: number,
): HTMLElement | null {
  const html =
    renderTemplate("degoog-result", buildResultContext(r, index)) ?? "";
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const el = wrapper.firstElementChild as HTMLElement | null;
  if (!el) return null;
  el.dataset.resultUrl = r.url;
  el.dataset.idx = r.idx ?? "";
  return el;
}

export function updateResults(
  container: HTMLElement | null,
  results: ScoredResult[],
  renderedUrls: Set<string>,
): void {
  if (!container) return;

  const existingEls = new Map<string, HTMLElement>();
  container.querySelectorAll<HTMLElement>("[data-result-url]").forEach((el) => {
    const url = el.dataset.resultUrl;
    if (url) existingEls.set(url, el);
  });

  const resultMap = new Map(results.map((r) => [r.url, r]));

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const existing = existingEls.get(r.url);
    if (existing) {
      const oldSources =
        existing.querySelector(".result-engines")?.textContent?.trim() ?? "";
      const newSources = r.sources.join(" ");
      const oldSnippet =
        existing.querySelector(".result-snippet")?.textContent?.trim() ?? "";
      const idxChanged = (existing.dataset.idx ?? "") !== (r.idx ?? "");
      if (
        oldSources !== newSources ||
        oldSnippet !== r.snippet.trim() ||
        idxChanged
      ) {
        const updated = renderResultEl(r, i);
        if (updated) {
          container.replaceChild(updated, existing);
          existingEls.set(r.url, updated);
        }
      }
    } else {
      renderedUrls.add(r.url);
      const el = renderResultEl(r, i);
      if (!el) continue;
      el.classList.add("result-stream-in");
      container.appendChild(el);
      existingEls.set(r.url, el);
    }
  }

  const children = Array.from(container.children) as HTMLElement[];
  const sorted = [...children].sort((a, b) => {
    const sa = resultMap.get(a.dataset.resultUrl ?? "")?.score ?? 0;
    const sb = resultMap.get(b.dataset.resultUrl ?? "")?.score ?? 0;
    return sb - sa;
  });

  let needsReorder = false;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] !== children[i]) {
      needsReorder = true;
      break;
    }
  }

  if (needsReorder) {
    for (const el of sorted) {
      container.appendChild(el);
    }
  }
}

export function updateEngineTimings(
  sidebar: HTMLElement | null,
  timings: EngineTiming[],
): void {
  if (!sidebar || !state.displayEnginePerformance) return;

  let panel = sidebar.querySelector<HTMLElement>(".streaming-engine-panel");
  if (!panel) {
    sidebar.querySelector(".skeleton-sidebar")?.remove();
    panel = document.createElement("div");
    const openClass =
      window.innerWidth >= PANEL_LAYOUT_BREAKPOINT ? " open" : "";
    panel.className = `sidebar-panel sidebar-accordion streaming-engine-panel${openClass} degoog-panel degoog-panel--accordion degoog-panel--stack-item`;
    const panelEl = panel;
    render(
      <StreamingEnginePanel
        onToggle={() => panelEl.classList.toggle("open")}
      />,
      panelEl,
    );
    const relatedPanel = sidebar.querySelector<HTMLElement>(
      ".related-searches-panel",
    );
    if (relatedPanel) {
      sidebar.insertBefore(panel, relatedPanel);
    } else {
      sidebar.appendChild(panel);
    }
  }

  const body = panel.querySelector<HTMLElement>(".sidebar-accordion-body");
  if (!body) return;

  render(
    <>
      {timings.map((et) => {
        const isDegoog = et.name === DEGOOG_ENGINE_NAME;
        const isRetrying = et.resultCount === -1;
        const resultsLabel = t("search-templates.sidebar.results", {
          count: String(et.resultCount),
        });
        const count = isDegoog
          ? t("search-templates.sidebar.from-index", {
              count: String(et.resultCount),
            })
          : engineCount(et, resultsLabel);
        return (
          <StreamingStatRow
            key={et.id ?? et.name}
            statusClass={
              isRetrying
                ? "engine-retrying"
                : !isDegoog && et.resultCount === 0
                  ? "engine-failed"
                  : ""
            }
            origin={originSlot(et.name, et.id)}
            name={et.name}
            meta={
              isRetrying
                ? `${t("search-templates.sidebar.retrying")} · ${et.time}ms`
                : [count, ` · ${et.time}ms`]
            }
          />
        );
      })}
    </>,
    body,
  );
  void paintOrigins(body);
}
