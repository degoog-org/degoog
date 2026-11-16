import { render } from "../../../../shared/ui/tribute/dom";
import { StreamingEnginePanel } from "./streaming-engine-panel";
import { StreamingStatRow } from "./streaming-stat-row";
import { state } from "../../../state";
import {
  compareEngineTimings,
  DEGOOG_ENGINE_NAME,
  type ScoredResult,
} from "../../../../shared/search-types";
import { renderTemplate } from "../../dom/template";
import {
  buildResultContext,
  hydrateFavicons,
} from "../../../modules/renderer/render";
import { engineCount } from "../engine-stats/engine-failure";
import { originSlot, paintOrigins } from "../engine-stats/engine-origins";
import { PANEL_LAYOUT_BREAKPOINT } from "../../../modules/renderer/media/render-media";
import type { StreamingTiming } from "./stream-feed";

const t = window.scopedT("themes/degoog");

export type { StreamingTiming } from "./stream-feed";

const _renderedFrom = new WeakMap<HTMLElement, string>();

const _fingerprint = (r: ScoredResult): string =>
  JSON.stringify([r.title, r.sources, r.snippet, r.idx ?? "", r.publishedAt ?? "", r.thumbnail ?? ""]);

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
  hydrateFavicons(el);
  el.dataset.resultUrl = r.url;
  el.dataset.idx = r.idx ?? "";
  _renderedFrom.set(el, _fingerprint(r));
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

  for (const el of Array.from(container.children) as HTMLElement[]) {
    const url = el.dataset.resultUrl;
    if (!url || resultMap.has(url)) continue;
    el.remove();
    existingEls.delete(url);
    renderedUrls.delete(url);
  }

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const existing = existingEls.get(r.url);
    if (existing) {
      if (_renderedFrom.get(existing) !== _fingerprint(r)) {
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

  for (let i = 0; i < sorted.length; i++) {
    const current = container.children[i] ?? null;
    if (current !== sorted[i]) container.insertBefore(sorted[i], current);
  }
}

const _inPageOrder = (container: HTMLElement, rows: HTMLElement[]): boolean => {
  const tail = Array.from(container.children).slice(-rows.length);
  return tail.length === rows.length && rows.every((row, i) => tail[i] === row);
};

export function updatePageRows(
  container: HTMLElement | null,
  results: ScoredResult[],
  page: number,
  startIndex: number,
): void {
  if (!container) return;
  const tag = String(page);
  const mine = (Array.from(container.children) as HTMLElement[]).filter(
    (el) => el.dataset.streamPage === tag,
  );
  const wanted = new Set(results.map((r) => r.url));
  const byUrl = new Map<string, HTMLElement>();
  for (const el of mine) {
    const url = el.dataset.resultUrl ?? "";
    if (wanted.has(url)) byUrl.set(url, el);
    else el.remove();
  }

  const rows: HTMLElement[] = [];
  results.forEach((r, i) => {
    const existing = byUrl.get(r.url);
    if (existing && _renderedFrom.get(existing) === _fingerprint(r)) {
      rows.push(existing);
      return;
    }
    const el = renderResultEl(r, startIndex + i);
    if (!el) return;
    el.dataset.streamPage = tag;
    if (existing) existing.replaceWith(el);
    else el.classList.add("result-stream-in");
    rows.push(el);
  });

  if (_inPageOrder(container, rows)) return;
  for (const row of rows) container.appendChild(row);
}

export function dropEnginePanels(sidebar: HTMLElement | null, which: "final" | "live"): void {
  sidebar
    ?.querySelector(which === "final" ? ".engine-performance-panel" : ".streaming-engine-panel")
    ?.remove();
}

const _emittingLabel = ({ count, expected }: { count: number; expected?: number }): string =>
  expected
    ? t("search-templates.sidebar.emitting", { count: String(count), total: String(expected) })
    : t("search-templates.sidebar.emitting-open", { count: String(count) });

export function updateEngineTimings(
  sidebar: HTMLElement | null,
  timings: StreamingTiming[],
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
      {[...timings].sort(compareEngineTimings).map((et) => {
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
              et.emitting
                ? "engine-emitting"
                : isRetrying
                  ? "engine-retrying"
                  : !isDegoog && et.resultCount === 0
                    ? "engine-failed"
                    : ""
            }
            origin={originSlot(et.name, et.id)}
            name={et.name}
            meta={
              et.emitting
                ? _emittingLabel(et.emitting)
                : isRetrying
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
