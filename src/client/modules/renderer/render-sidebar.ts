import { escapeHtml } from "../../utils/dom";
import { proxyImageUrl } from "../../utils/url";
import { retryEngine } from "../../utils/search-actions";
import type { SearchResponse, SlotPanel } from "../../types";

export const setupRetryLinks = (container: HTMLElement): void => {
  container.querySelectorAll<HTMLElement>(".engine-retry-link").forEach((link) => {
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const engineName = link.dataset.engine;
      if (!engineName) return;
      link.classList.add("retrying");
      link.textContent = "retrying...";
      try {
        await retryEngine(engineName);
      } catch {}
      link.classList.remove("retrying");
      link.textContent = "retry";
    });
  });
};

const _sidebarAccordion = (title: string, content: string): string =>
  `<div class="sidebar-panel sidebar-accordion">
    <button class="sidebar-accordion-toggle" type="button">
      <span>${escapeHtml(title)}</span>
      <svg class="accordion-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </button>
    <div class="sidebar-accordion-body">${content}</div>
  </div>`;

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
      const title = panel.title ?? "Info";
      html += _sidebarAccordion(title, panel.html);
    }
  } else if (data.knowledgePanel) {
    const kp = data.knowledgePanel;
    let kpContent = "";
    if (kp.image) {
      kpContent += `<img class="kp-image" src="${escapeHtml(proxyImageUrl(kp.image))}" alt="${escapeHtml(kp.title)}">`;
    }
    kpContent += `<h3 class="kp-title">${escapeHtml(kp.title)}</h3>`;
    kpContent += `<p class="kp-description">${escapeHtml(kp.description)}</p>`;
    kpContent += `<a class="kp-link" href="${escapeHtml(kp.url)}" target="_blank">Wikipedia</a>`;
    html += _sidebarAccordion(kp.title, kpContent);
  }

  if (data.engineTimings && data.engineTimings.length > 0) {
    let statsContent = "";
    const maxTime = Math.max(...data.engineTimings.map((e) => e.time));
    data.engineTimings.forEach((et) => {
      const barWidth = Math.min(100, (et.time / maxTime) * 100);
      const statusClass = et.resultCount === 0 ? " engine-failed" : "";
      statsContent += `
        <div class="engine-stat-row${statusClass}">
          <div class="engine-stat-info">
            <div class="engine-stat-label">${escapeHtml(et.name)}</div>
            <div class="engine-stat-meta">${et.resultCount} results · ${et.time}ms</div>
          </div>
          <a class="engine-retry-link" data-engine="${escapeHtml(et.name)}">retry</a>
        </div>`;
      void barWidth;
    });
    html += _sidebarAccordion("Engine Performance", statsContent);
  }

  if (data.relatedSearches && data.relatedSearches.length > 0) {
    let relContent = "";
    data.relatedSearches.forEach((term) => {
      relContent += `<a class="related-search-link" data-query="${escapeHtml(term)}">${escapeHtml(term)}</a>`;
    });
    html += _sidebarAccordion("People also search for", relContent);
  }

  sidebar.innerHTML = html;

  sidebar
    .querySelectorAll<HTMLElement>(".sidebar-accordion-toggle")
    .forEach((btn) => {
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
}
