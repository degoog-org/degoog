import { EngineStatsPanel } from "./engine-stats-panel";
import { RelatedSearches } from "./related-searches";
import { state } from "../../state";
import type { SearchResponse, SlotPanel } from "../../types";
import { clear, render } from "../../../shared/ui/tribute/dom";
import { raw } from "../../../shared/ui/tribute/rawdogit";
import { SidebarAccordion } from "../../../shared/ui/components/layout/sidebar-accordion";
import { retryEngine } from "../../utils/search-actions";
import { paintOrigins } from "../../utils/search/engine-origins";
import type { EngineTimingWithPage } from "../../utils/search/engine-stats";

const t = window.scopedT("themes/degoog");

export const setupRetryLinks = (container: HTMLElement): void => {
  container
    .querySelectorAll<HTMLElement>(".engine-retry-link")
    .forEach((link) => {
      link.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const engineName = link.dataset.engine;
        if (!engineName) return;
        const page = parseInt(link.dataset.page ?? "", 10);
        link.classList.add("retrying");
        link.textContent = t("search-templates.sidebar.retrying");
        try {
          await retryEngine(
            engineName,
            Number.isFinite(page) ? page : undefined,
          );
        } catch (err) {
          console.warn("[sidebar] engine retry failed", err);
        }
        link.classList.remove("retrying");
        link.textContent = t("search-templates.sidebar.retry");
      });
    });
};

const _detached = (node: JSX.Element): HTMLElement | null => {
  const wrapper = document.createElement("div");
  render(node, wrapper);
  return wrapper.firstElementChild as HTMLElement | null;
};

export const renderEngineStats = (
  timings: EngineTimingWithPage[],
  onRelatedSearch: (q: string) => void,
): void => {
  const sidebar = document.getElementById("results-sidebar");
  if (!sidebar) return;
  const stats = EngineStatsPanel({ timings });
  const next = stats ? _detached(stats) : null;
  const current = sidebar.querySelector<HTMLElement>(
    ".engine-performance-panel",
  );
  if (!next) {
    current?.remove();
    return;
  }
  if (current) current.replaceWith(next);
  else sidebar.prepend(next);
  _wireSidebar(sidebar, onRelatedSearch);
};

const _wireSidebar = (
  sidebar: HTMLElement,
  onRelatedSearch: (q: string) => void,
): void => {
  sidebar
    .querySelectorAll<HTMLElement>(".sidebar-accordion-toggle")
    .forEach((btn) => {
      if (btn.dataset.sidebarToggleWired === "true") return;
      btn.dataset.sidebarToggleWired = "true";
      btn.addEventListener("click", () => {
        btn.closest(".sidebar-accordion")?.classList.toggle("open");
      });
    });

  if (window.innerWidth >= 768) {
    sidebar
      .querySelectorAll<HTMLElement>(".sidebar-accordion")
      .forEach((el) => el.classList.add("open"));
  }

  setupRetryLinks(sidebar);

  void paintOrigins(sidebar);

  sidebar
    .querySelectorAll<HTMLElement>(".related-search-link")
    .forEach((el) => {
      if (el.dataset.relatedSearchWired === "true") return;
      el.dataset.relatedSearchWired = "true";
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const q = el.dataset.query;
        const resultsInput = document.getElementById(
          "results-search-input",
        ) as HTMLInputElement | null;
        if (resultsInput && q) resultsInput.value = q;
        if (onRelatedSearch && q) onRelatedSearch(q);
      });
    });
};

export function renderSidebarSuggestions(
  terms: string[],
  onRelatedSearch: (q: string) => void,
): void {
  const sidebar = document.getElementById("results-sidebar");
  if (!sidebar || !state.displaySearchSuggestions || terms.length === 0) return;

  sidebar.querySelector(".skeleton-sidebar")?.remove();
  const existing = sidebar.querySelector<HTMLElement>(
    ".related-searches-panel",
  );
  const panel = _detached(<RelatedSearches terms={terms} />);
  if (!panel) return;

  panel.classList.add("related-searches-panel");
  if (existing) {
    existing.replaceWith(panel);
  } else {
    sidebar.appendChild(panel);
  }
  _wireSidebar(sidebar, onRelatedSearch);
}

export function renderSidebar(
  data: SearchResponse,
  onRelatedSearch: (q: string) => void,
  options?: { sidebarTopPanels?: SlotPanel[] },
): void {
  const sidebar = document.getElementById("results-sidebar");
  if (!sidebar) return;

  const panels: JSX.Element[] = [];

  for (const panel of options?.sidebarTopPanels ?? []) {
    const title = panel.title ?? t("search-templates.sidebar.info");
    panels.push(
      <SidebarAccordion title={title}>{raw(panel.html)}</SidebarAccordion>,
    );
  }

  const stats = EngineStatsPanel({ timings: data.engineTimings ?? [] });
  if (stats) panels.push(stats);

  const relatedSearches = data.relatedSearches?.length
    ? data.relatedSearches
    : state.currentRelatedSearches;
  if (state.displaySearchSuggestions && relatedSearches.length > 0) {
    panels.push(<RelatedSearches terms={relatedSearches} />);
  }

  clear(sidebar);
  render(panels, sidebar);
  _wireSidebar(sidebar, onRelatedSearch);
}

export function prependKnowledgePanels(panels: SlotPanel[]): void {
  const sidebar = document.getElementById("results-sidebar");
  if (!sidebar || !panels.length) return;
  const wrapper = document.createElement("div");
  render(
    panels.map((p) => (
      <SidebarAccordion title={p.title ?? t("search-templates.sidebar.info")}>
        {raw(p.html)}
      </SidebarAccordion>
    )),
    wrapper,
  );
  sidebar.prepend(...Array.from(wrapper.children));
  if (window.innerWidth >= 768) {
    sidebar
      .querySelectorAll<HTMLElement>(".sidebar-accordion")
      .forEach((el) => el.classList.add("open"));
  }
}
