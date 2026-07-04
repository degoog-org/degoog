import { state } from "../../state";
import type { EngineTiming, SearchResponse, SlotPanel } from "../../types";
import { escapeHtml } from "../../utils/dom";
import { retryEngine } from "../../utils/search-actions";
import { engineCountHtml } from "../../utils/search/engine-failure";

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
        link.classList.add("retrying");
        link.textContent = t("search-templates.sidebar.retrying");
        try {
          await retryEngine(engineName);
        } catch (err) {
          console.warn("[sidebar] engine retry failed", err);
        }
        link.classList.remove("retrying");
        link.textContent = t("search-templates.sidebar.retry");
      });
    });
};

export const sidebarAccordion = (title: string, content: string): string =>
  `<div class="sidebar-panel sidebar-accordion degoog-panel degoog-panel--accordion degoog-panel--stack-item">
    <button class="sidebar-accordion-toggle degoog-accordion-toggle degoog-accordion-toggle--sidebar" type="button">
      <span>${escapeHtml(title)}</span>
      <svg class="accordion-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </button>
    <div class="sidebar-accordion-body degoog-accordion-body">${content}</div>
  </div>`;

export const engineStatsHtml = (timings: EngineTiming[]): string => {
  if (!state.displayEnginePerformance || timings.length === 0) return "";

  let statsContent = "";
  timings.forEach((et) => {
    const isIndexed = et.resultCount === 0 && et.indexed === true;
    const statusClass = et.resultCount === 0 && !isIndexed ? " engine-failed" : "";
    const resultsLabel = t("search-templates.sidebar.results", {
      count: String(et.resultCount),
    });
    const countHtml = isIndexed
      ? resultsLabel
      : engineCountHtml(et, resultsLabel);
    const metaText = isIndexed
      ? `${t("search-templates.result.just-indexed")} · ${et.time}ms`
      : `${countHtml} · ${et.time}ms`;
    const action = isIndexed
      ? ""
      : `<a class="engine-retry-link degoog-link" data-engine="${escapeHtml(et.name)}">${t("search-templates.sidebar.retry")}</a>`;
    statsContent += `
      <div class="engine-stat-row${statusClass}">
        <div class="engine-stat-info">
          <div class="engine-stat-label degoog-text">${escapeHtml(et.name)}</div>
          <div class="engine-stat-meta degoog-text degoog-text--sm degoog-text--secondary">${metaText}</div>
        </div>
        ${action}
      </div>`;
  });

  return sidebarAccordion(
    t("search-templates.sidebar.engine-performance"),
    statsContent,
  );
};

const _relatedSearchesHtml = (terms: string[]): string =>
  sidebarAccordion(
    t("search-templates.sidebar.people-also-search"),
    terms
      .map(
        (term) =>
          `<a class="related-search-link degoog-link" data-query="${escapeHtml(term)}">${escapeHtml(term)}</a>`,
      )
      .join(""),
  );

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
  const existing = sidebar.querySelector<HTMLElement>(".related-searches-panel");
  const wrapper = document.createElement("div");
  wrapper.innerHTML = _relatedSearchesHtml(terms);
  const panel = wrapper.firstElementChild as HTMLElement | null;
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

  let html = "";

  const sidebarTop = options?.sidebarTopPanels?.length
    ? options.sidebarTopPanels
    : [];
  if (sidebarTop.length > 0) {
    for (const panel of sidebarTop) {
      const title = panel.title ?? t("search-templates.sidebar.info");
      html += sidebarAccordion(title, panel.html);
    }
  }

  html += engineStatsHtml(data.engineTimings ?? []);

  const relatedSearches = data.relatedSearches?.length
    ? data.relatedSearches
    : state.currentRelatedSearches;
  if (state.displaySearchSuggestions && relatedSearches.length > 0) {
    html += _relatedSearchesHtml(relatedSearches);
  }

  sidebar.innerHTML = html;
  _wireSidebar(sidebar, onRelatedSearch);
}

export function prependKnowledgePanels(panels: SlotPanel[]): void {
  const sidebar = document.getElementById("results-sidebar");
  if (!sidebar || !panels.length) return;
  const html = panels
    .map((p) => sidebarAccordion(p.title ?? t("search-templates.sidebar.info"), p.html))
    .join("");
  sidebar.insertAdjacentHTML("afterbegin", html);
  if (window.innerWidth >= 768) {
    sidebar
      .querySelectorAll<HTMLElement>(".sidebar-accordion")
      .forEach((el) => el.classList.add("open"));
  }
}
