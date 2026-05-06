import { state } from "../../state";
import type { EngineTiming, ScoredResult } from "../../types";
import { renderTemplate } from "../../utils/template";
import { buildResultContext } from "../../modules/renderer/render";

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
      if (oldSources !== newSources || oldSnippet !== r.snippet.trim()) {
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
    panel.className="sidebar-panel sidebar-accordion streaming-engine-panel open degoog-panel degoog-panel--accordion degoog-panel--stack-item";
    panel.innerHTML = `
      <button class="sidebar-accordion-toggle degoog-accordion-toggle degoog-accordion-toggle--sidebar" type="button">
        <span>Engine Performance</span>
        <svg class="accordion-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="sidebar-accordion-body degoog-accordion-body"></div>`;
    panel
      .querySelector(".sidebar-accordion-toggle")
      ?.addEventListener("click", () => {
        panel!.classList.toggle("open");
      });
    sidebar.appendChild(panel);
  }

  const body = panel.querySelector<HTMLElement>(".sidebar-accordion-body");
  if (!body) return;

  let html = "";
  for (const et of timings) {
    const isRetrying = et.resultCount === -1;
    const statusClass = isRetrying
      ? " engine-retrying"
      : et.resultCount === 0
        ? " engine-failed"
        : "";
    const meta = isRetrying
      ? `retrying... · ${et.time}ms`
      : `${et.resultCount} results · ${et.time}ms`;
    html += `
      <div class="engine-stat-row${statusClass}">
        <div class="engine-stat-info">
          <div class="engine-stat-label">${et.name}</div>
          <div class="engine-stat-meta">${meta}</div>
        </div>
      </div>`;
  }
  body.innerHTML = html;
}
