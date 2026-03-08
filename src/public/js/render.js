import { state } from "./state.js";
import { MAX_PAGE } from "./constants.js";
import { escapeHtml, cleanUrl, cleanHostname } from "./utils.js";
import { faviconUrl, proxyImageUrl } from "./url.js";
import {
  setupMediaObserver,
  destroyMediaObserver,
  registerAppendMediaCards,
  openMediaPreview,
} from "./media.js";

const SLOT_IDS = ["slot-above-results", "slot-below-results", "slot-sidebar"];

export function clearSlotPanels() {
  for (const id of SLOT_IDS) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  }
  const glanceEl = document.getElementById("at-a-glance");
  if (glanceEl) glanceEl.innerHTML = "";
}

function renderSlotPanelsInto(panels, clearFirst) {
  if (!panels || !Array.isArray(panels) || panels.length === 0) return;
  if (clearFirst) clearSlotPanels();
  const byPosition = {
    "above-results": document.getElementById("slot-above-results"),
    "below-results": document.getElementById("slot-below-results"),
    sidebar: document.getElementById("slot-sidebar"),
    "at-a-glance": document.getElementById("at-a-glance"),
  };
  for (const panel of panels) {
    const container = byPosition[panel.position];
    if (!container) continue;
    if (panel.position === "at-a-glance") {
      container.innerHTML = panel.html;
    } else {
      const block = document.createElement("div");
      block.className = "results-slot-panel";
      if (panel.title) {
        const titleEl = document.createElement("div");
        titleEl.className = "results-slot-panel-title";
        titleEl.textContent = panel.title;
        block.appendChild(titleEl);
      }
      const body = document.createElement("div");
      body.className = "results-slot-panel-body";
      body.innerHTML = panel.html;
      block.appendChild(body);
      container.appendChild(block);
    }
  }
}

export function renderSlotPanels(panels) {
  renderSlotPanelsInto(panels, true);
}

export function appendSlotPanels(panels) {
  renderSlotPanelsInto(panels, false);
}

export function renderAtAGlance(data) {
  const container = document.getElementById("at-a-glance");
  if (!data) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = `
    <div class="glance-box">
      <div class="glance-snippet">${escapeHtml(data.snippet)}</div>
      <a class="glance-link" href="${escapeHtml(data.url)}" target="_blank">${escapeHtml(data.title)}</a>
      <div class="glance-sources">Found on: ${data.sources.map(s => `<span class="glance-source">${escapeHtml(s)}</span>`).join(", ")}</div>
    </div>
  `;
}

export function appendMediaCards(grid, results, type) {
  const startIdx = grid.children.length;
  const cardClass = type === "image" ? "image-card" : "video-card";
  const selector = `.${cardClass}`;

  const fragment = document.createDocumentFragment();
  results.forEach((r, i) => {
    const idx = startIdx + i;
    const card = document.createElement("div");
    card.className = cardClass;
    card.dataset.idx = idx;

    if (type === "image") {
      card.innerHTML = `
        <div class="image-thumb-wrap">
          <img class="image-thumb" src="${escapeHtml(proxyImageUrl(r.thumbnail || ""))}" alt="${escapeHtml(r.title)}" loading="lazy" onerror="this.parentElement.parentElement.style.display='none'">
        </div>
        <div class="image-info">
          <span class="image-title">${escapeHtml(r.title)}</span>
          <span class="image-source">${escapeHtml(cleanHostname(r.url))}</span>
        </div>`;
    } else {
      card.innerHTML = `
        <div class="video-thumb-wrap">
          <img class="video-thumb" src="${escapeHtml(proxyImageUrl(r.thumbnail || ""))}" alt="${escapeHtml(r.title)}" loading="lazy" onerror="this.style.display='none'">
          ${r.duration ? `<span class="video-duration">${escapeHtml(r.duration)}</span>` : ""}
          <div class="video-play-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
        </div>
        <div class="video-info">
          <span class="video-title">${escapeHtml(r.title)}</span>
          <span class="video-source">${escapeHtml(cleanHostname(r.url))}</span>
        </div>`;
    }

    card.addEventListener("click", () => {
      openMediaPreview(state.currentResults[idx], idx, selector);
    });

    fragment.appendChild(card);
  });

  grid.appendChild(fragment);
}

registerAppendMediaCards(appendMediaCards);

export function renderImageGrid(results, container) {
  let grid = container.querySelector(".image-grid");
  if (!grid) {
    container.innerHTML = '<div class="image-grid"></div><div class="media-scroll-sentinel"></div>';
    grid = container.querySelector(".image-grid");
  }
  appendMediaCards(grid, results, "image");
}

export function renderVideoGrid(results, container) {
  let grid = container.querySelector(".video-grid");
  if (!grid) {
    container.innerHTML = '<div class="video-grid"></div><div class="media-scroll-sentinel"></div>';
    grid = container.querySelector(".video-grid");
  }
  appendMediaCards(grid, results, "video");
}

export function renderResults(results) {
  const container = document.getElementById("results-list");
  const layout = document.querySelector(".results-layout");
  if (state.currentType === "images" || state.currentType === "videos") {
    layout.classList.add("media-mode");
  } else {
    layout.classList.remove("media-mode");
  }

  if (results.length === 0) {
    container.innerHTML = '<div class="no-results">No results found.</div>';
    if (state.currentType === "all" || state.currentType === "news") {
      renderPagination(MAX_PAGE, state.currentPage);
    }
    return;
  }

  if (state.currentType === "images") {
    renderImageGrid(results, container);
    setupMediaObserver("images");
    document.getElementById("pagination").innerHTML = "";
    return;
  }
  if (state.currentType === "videos") {
    renderVideoGrid(results, container);
    setupMediaObserver("videos");
    document.getElementById("pagination").innerHTML = "";
    return;
  }

  destroyMediaObserver();

  container.innerHTML = results
    .map(
      (r) => {
        const thumbBlock =
          r.thumbnail &&
          `<div class="result-thumbnail-wrap"><img class="result-thumbnail-img" src="${escapeHtml(proxyImageUrl(r.thumbnail))}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`;
        const body = `
      <div class="result-url-row">
        <img class="result-favicon" src="${faviconUrl(r.url)}" alt="" width="26" height="26" onerror="this.style.display='none'">
        <cite class="result-cite">${escapeHtml(cleanUrl(r.url))}</cite>
      </div>
      <a class="result-title" href="${escapeHtml(r.url)}" target="_blank">${escapeHtml(r.title)}</a>
      <p class="result-snippet">${escapeHtml(r.snippet)}</p>
      <div class="result-engines">${r.sources.map((s) => `<span class="result-engine-tag">${escapeHtml(s)}</span>`).join("")}</div>`;
        if (thumbBlock) {
          return `<div class="result-item"><div class="result-item-inner"><div class="result-body">${body}</div>${thumbBlock}</div></div>`;
        }
        return `<div class="result-item">${body}</div>`;
      }
    )
    .join("");

  if (state.currentType === "all" || state.currentType === "news") {
    renderPagination(MAX_PAGE, state.currentPage);
  }
}

export const sidebarAccordion = (title, content) =>
  `<div class="sidebar-panel sidebar-accordion">
    <button class="sidebar-accordion-toggle" type="button">
      <span>${escapeHtml(title)}</span>
      <svg class="accordion-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </button>
    <div class="sidebar-accordion-body">${content}</div>
  </div>`;

export function renderSidebar(data, onRelatedSearch) {
  const sidebar = document.getElementById("results-sidebar");
  if (!sidebar) return;

  let html = "";

  if (data.knowledgePanel) {
    const kp = data.knowledgePanel;
    let kpContent = "";
    if (kp.image) {
      kpContent += `<img class="kp-image" src="${escapeHtml(proxyImageUrl(kp.image))}" alt="${escapeHtml(kp.title)}">`;
    }
    kpContent += `<h3 class="kp-title">${escapeHtml(kp.title)}</h3>`;
    kpContent += `<p class="kp-description">${escapeHtml(kp.description)}</p>`;
    kpContent += `<a class="kp-link" href="${escapeHtml(kp.url)}" target="_blank">Wikipedia</a>`;
    html += sidebarAccordion(kp.title, kpContent);
  }

  if (data.engineTimings && data.engineTimings.length > 0) {
    let statsContent = "";
    data.engineTimings.forEach((et) => {
      const barWidth = Math.min(100, (et.time / Math.max(...data.engineTimings.map(e => e.time))) * 100);
      const statusClass = et.resultCount === 0 ? " engine-failed" : "";
      statsContent += `
        <div class="engine-stat-row${statusClass}">
          <div class="engine-stat-info">
            <div class="engine-stat-label">${escapeHtml(et.name)}</div>
            <div class="engine-stat-meta">${et.resultCount} results · ${et.time}ms</div>
          </div>
          <a class="engine-retry-link" data-engine="${escapeHtml(et.name)}">retry</a>
        </div>`;
    });
    html += sidebarAccordion("Engine Performance", statsContent);
  }

  if (data.relatedSearches && data.relatedSearches.length > 0) {
    let relContent = "";
    data.relatedSearches.forEach((term) => {
      relContent += `<a class="related-search-link" data-query="${escapeHtml(term)}">${escapeHtml(term)}</a>`;
    });
    html += sidebarAccordion("People also search for", relContent);
  }

  sidebar.innerHTML = html;

  sidebar.querySelectorAll(".sidebar-accordion-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".sidebar-accordion").classList.toggle("open");
    });
  });

  if (window.innerWidth >= 768) {
    sidebar.querySelectorAll(".sidebar-accordion").forEach((el) => el.classList.add("open"));
  }

  sidebar.querySelectorAll(".engine-retry-link").forEach((link) => {
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const engineName = link.dataset.engine;
      link.classList.add("retrying");
      link.textContent = "retrying...";
      try {
        const { retryEngine } = await import("./search.js");
        await retryEngine(engineName);
      } catch {}
      link.classList.remove("retrying");
      link.textContent = "retry";
    });
  });

  sidebar.querySelectorAll(".related-search-link").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const q = el.dataset.query;
      document.getElementById("results-search-input").value = q;
      if (onRelatedSearch) onRelatedSearch(q);
    });
  });
}

export function renderPagination(totalPages, activePage) {
  const container = document.getElementById("pagination");
  if (totalPages < 1) {
    container.innerHTML = "";
    return;
  }

  let html = '<div class="pagination">';

  /** @todo: re-enable previous page when I figure out how I want to style them */
  // if (activePage > 1) {
  //   html += `<a class="pagination-nav" data-page="${activePage - 1}">&lt; Previous</a>`;
  // }

  html += '<div class="pagination-pages">';

  const maxVisible = 10;
  let startPage = Math.max(1, activePage - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);
  if (endPage - startPage < maxVisible - 1) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    if (i === activePage) {
      html += `<span class="pagination-current">${i}</span>`;
    } else {
      html += `<a class="pagination-link" data-page="${i}">${i}</a>`;
    }
  }

  html += '</div>';

  /** @todo: re-enable next page when I figure out how I want to style them */
  // if (activePage < totalPages) {
  //   html += `<a class="pagination-nav" data-page="${activePage + 1}">Next &gt;</a>`;
  // }

  html += '</div>';
  container.innerHTML = html;

  container.querySelectorAll("[data-page]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const pageNum = parseInt(el.dataset.page, 10);
      if (pageNum >= 1 && pageNum <= MAX_PAGE) goToPage(pageNum);
    });
  });
}

async function goToPage(pageNum) {
  const { goToPage: goToPageFn } = await import("./search.js");
  goToPageFn(pageNum);
}
