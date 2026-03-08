import { state } from "./state.js";
import { MAX_PAGE } from "./constants.js";
import { showResults, setActiveTab } from "./navigation.js";
import { getEngines } from "./engines.js";
import { buildSearchUrl } from "./url.js";
import { destroyMediaObserver, closeMediaPreview } from "./media.js";
import {
  renderAtAGlance,
  renderResults,
  renderSidebar,
  clearSlotPanels,
  renderSlotPanels,
  appendSlotPanels,
} from "./render.js";
import { hideAcDropdown } from "./autocomplete.js";

function runScriptsInContainer(container) {
  if (!container) return;
  container.querySelectorAll("script").forEach((oldScript) => {
    const script = document.createElement("script");
    script.textContent = oldScript.textContent;
    container.appendChild(script);
  });
}

function setResultsMeta(metaText, showClearQuery = false) {
  const el = document.getElementById("results-meta");
  if (!el) return;
  if (showClearQuery) {
    el.innerHTML = "";
    const span = document.createElement("span");
    span.textContent = metaText;
    el.appendChild(span);
    const btn = document.createElement("a");
    btn.className = "news-clear-query-btn";
    btn.textContent = "Clear query and show latest news";
    btn.addEventListener("click", () => performSearch("", "news"));
    el.appendChild(btn);
  } else {
    el.textContent = metaText;
  }
}

let commandsCache = null;

if (typeof window !== "undefined") {
  window.addEventListener("extensions-saved", () => {
    commandsCache = null;
  });
}

function getNaturalLanguageBangQuery(query, commands) {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const withNatural = commands.filter((c) => c.naturalLanguage && c.id);
  const firstWordMap = new Map();
  const phraseList = [];
  for (const c of withNatural) {
    const trigger = c.trigger.toLowerCase();
    firstWordMap.set(trigger, c.trigger);
    for (const a of c.aliases || []) firstWordMap.set(a.toLowerCase(), c.trigger);
    for (const p of c.naturalLanguagePhrases || []) {
      phraseList.push({ phrase: p.toLowerCase(), trigger: c.trigger });
    }
  }
  phraseList.sort((a, b) => b.phrase.length - a.phrase.length);
  for (const { phrase, trigger } of phraseList) {
    if (lower === phrase || lower.startsWith(phrase + " ")) {
      const rest = trimmed.slice(phrase.length).trim();
      return "!" + trigger + (rest ? " " + rest : "");
    }
  }
  const firstWord = trimmed.split(/\s+/)[0].toLowerCase();
  const rest = trimmed.slice(firstWord.length).trim();
  const canonical = firstWordMap.get(firstWord);
  if (canonical) return "!" + canonical + (rest ? " " + rest : "");
  return null;
}

export async function performSearch(query, type, page) {
  type = type || state.currentType || "all";
  if (!query.trim() && type !== "news") return;

  if (query.trim().startsWith("!")) {
    state.currentQuery = query;
    return performBangCommand(query, type, page || 1);
  }

  state.currentQuery = query;
  state.currentType = type;
  state.currentPage = 1;
  state.lastPage = MAX_PAGE;
  state.imagePage = 1;
  state.imageLastPage = MAX_PAGE;
  state.videoPage = 1;
  state.videoLastPage = MAX_PAGE;
  destroyMediaObserver();

  const engines = await getEngines();
  const url = buildSearchUrl(query, engines, type, 1);

  showResults();
  setActiveTab(type);
  closeMediaPreview();
  hideAcDropdown(document.getElementById("ac-dropdown-home"));
  hideAcDropdown(document.getElementById("ac-dropdown-results"));
  document.getElementById("results-search-input").value = query;
  document.getElementById("results-meta").textContent = "Searching...";
  const useSkeleton = type === "all" || type === "news";
  document.getElementById("at-a-glance").innerHTML = type === "all" ? skeletonGlance() : "";
  document.getElementById("results-list").innerHTML = useSkeleton ? skeletonResults() : '<div class="loading-dots"><span></span><span></span><span></span></div>';
  document.getElementById("pagination").innerHTML = "";
  document.getElementById("results-sidebar").innerHTML = "";
  clearSlotPanels();
  document.title = `${query} - degoog`;

  const urlParams = new URLSearchParams({ q: query });
  if (type !== "all") urlParams.set("type", type);
  history.pushState(null, "", `/search?${urlParams.toString()}`);

  let commands = commandsCache;
  if (!commands) {
    try {
      const cmdRes = await fetch("/api/commands", { cache: "no-store" });
      if (cmdRes.ok) {
        const body = await cmdRes.json();
        commands = body.commands || [];
        commandsCache = commands;
      }
    } catch { }
  }
  const bangQuery = commands && commands.length ? getNaturalLanguageBangQuery(query, commands) : null;

  if (bangQuery) {
    try {
      const [cmdRes, searchRes] = await Promise.all([
        fetch(`/api/command?q=${encodeURIComponent(bangQuery)}`),
        fetch(url),
      ]);
      const searchData = await searchRes.json();
      state.currentResults = searchData.results;
      state.currentData = searchData;
      const metaText = `About ${searchData.results.length} results (${(searchData.totalTime / 1000).toFixed(2)} seconds)`;
      setResultsMeta(metaText, type === "news" && query.trim().length > 0);
      if (type === "all") {
        renderSidebar(searchData, (q) => performSearch(q));
        renderSlotPanels(searchData.slotPanels || []);
        fetchSlotPanels(query);
      }
      if (type !== "all") {
        document.getElementById("at-a-glance").innerHTML = "";
        document.getElementById("results-sidebar").innerHTML = "";
      }
      renderResults(searchData.results);

      const glanceEl = document.getElementById("at-a-glance");
      if (glanceEl && cmdRes.ok) {
        const cmdData = await cmdRes.json();
        if (cmdData.type === "engine" && cmdData.results && cmdData.results.length > 0) {
          const glance = cmdData.atAGlance && cmdData.atAGlance.snippet
            ? `<div class="glance-box"><div class="glance-snippet">${escapeHtmlSimple(cmdData.atAGlance.snippet)}</div></div>`
            : "";
          glanceEl.innerHTML = `<div class="command-result">${glance}<p class="natural-command-meta">${cmdData.results.length} results from engine</p></div>`;
        } else if (cmdData.type === "engine") {
          glanceEl.innerHTML = `<div class="command-result"><p class="natural-command-meta">${cmdData.results.length} results from engine</p></div>`;
        } else if (cmdData.title !== undefined && cmdData.html !== undefined) {
          glanceEl.innerHTML = `<div class="command-result">${cmdData.html || ""}</div>`;
          runScriptsInContainer(glanceEl);
        }
      }
    } catch (err) {
      document.getElementById("results-meta").textContent = "";
      document.getElementById("results-list").innerHTML = '<div class="no-results">Search failed. Please try again.</div>';
    }
    return;
  }

  try {
    const res = await fetch(url);
    const data = await res.json();

    state.currentResults = data.results;
    state.currentData = data;

    const metaText = `About ${data.results.length} results (${(data.totalTime / 1000).toFixed(2)} seconds)`;
    setResultsMeta(metaText, type === "news" && query.trim().length > 0);

    if (type === "all") {
      renderSidebar(data, (q) => performSearch(q));
      renderSlotPanels(data.slotPanels || []);
      fetchGlancePanels(query, data.results, data.atAGlance);
      if (!data.slotPanels || data.slotPanels.length === 0) fetchSlotPanels(query);
    }
    if (type !== "all") {
      document.getElementById("at-a-glance").innerHTML = "";
      document.getElementById("results-sidebar").innerHTML = "";
    }
    renderResults(data.results);
  } catch (err) {
    document.getElementById("results-meta").textContent = "";
    document.getElementById("results-list").innerHTML = '<div class="no-results">Search failed. Please try again.</div>';
  }
}

async function performBangCommand(query, type, page = 1) {
  showResults();
  closeMediaPreview();
  hideAcDropdown(document.getElementById("ac-dropdown-home"));
  hideAcDropdown(document.getElementById("ac-dropdown-results"));
  document.getElementById("results-search-input").value = query;
  document.getElementById("results-meta").textContent = "Running command...";
  document.getElementById("at-a-glance").innerHTML = "";
  document.getElementById("results-list").innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
  document.getElementById("pagination").innerHTML = "";
  document.getElementById("results-sidebar").innerHTML = "";
  clearSlotPanels();
  document.title = `${query} - degoog`;

  state.currentBangQuery = query;

  const urlParams = new URLSearchParams({ q: query });
  if (page > 1) urlParams.set("page", String(page));
  history.pushState(null, "", `/search?${urlParams.toString()}`);

  try {
    const apiParams = new URLSearchParams({ q: query });
    if (page > 1) apiParams.set("page", String(page));
    if (state.currentTimeFilter && state.currentTimeFilter !== "any") {
      apiParams.set("time", state.currentTimeFilter);
    }
    const res = await fetch(`/api/command?${apiParams.toString()}`);
    if (!res.ok) throw new Error("not found");
    const data = await res.json();
    if (data.type === "engine") {
      state.currentResults = data.results;
      state.currentData = data;
      document.getElementById("results-meta").textContent =
        `About ${data.results.length} results (${(data.totalTime / 1000).toFixed(2)} seconds)`;
      renderAtAGlance(data.atAGlance);
      renderResults(data.results);
      return;
    }
    document.getElementById("results-meta").textContent = data.title;
    document.getElementById("results-list").innerHTML = data.html || "";
    runScriptsInContainer(document.getElementById("results-list"));
    if (data.totalPages > 1) {
      renderBangPagination(data.totalPages, data.page, query);
    }
  } catch {
    document.getElementById("results-meta").textContent = "";
    document.getElementById("results-list").innerHTML = '<div class="no-results">Unknown command. Type <strong>!help</strong> for available commands.</div>';
  }
}

export async function goToPage(pageNum) {
  if (pageNum === state.currentPage) return;
  const useSkeleton = state.currentType === "all" || state.currentType === "news";
  document.getElementById("results-list").innerHTML = useSkeleton ? skeletonResults() : '<div class="loading-dots"><span></span><span></span><span></span></div>';
  document.getElementById("pagination").innerHTML = "";
  const engines = await getEngines();
  const url = buildSearchUrl(state.currentQuery, engines, state.currentType, pageNum);
  try {
    const res = await fetch(url);
    const data = await res.json();
    state.currentResults = data.results;
    state.currentData = data;
    state.currentPage = pageNum;
    const metaText = `About ${state.currentResults.length} results — Page ${state.currentPage}`;
    setResultsMeta(metaText, state.currentType === "news" && state.currentQuery.trim().length > 0);
    if (state.currentPage === 1 && data.atAGlance) {
      renderAtAGlance(data.atAGlance);
    }
    if (state.currentType === "all" && data.slotPanels && data.slotPanels.length > 0) {
      renderSlotPanels(data.slotPanels);
    }
    renderResults(state.currentResults);
    window.scrollTo(0, 0);
  } catch {
    document.getElementById("results-list").innerHTML = '<div class="no-results">Search failed. Please try again.</div>';
  }
}

export async function retryEngine(engineName) {
  if (!state.currentQuery || !state.currentData) return;

  const engines = await getEngines();
  const params = new URLSearchParams({ q: state.currentQuery, engine: engineName });
  for (const [key, val] of Object.entries(engines)) {
    params.set(key, String(val));
  }
  if (state.currentType && state.currentType !== "all") {
    params.set("type", state.currentType);
  }
  if (state.currentPage > 1) {
    params.set("page", String(state.currentPage));
  }
  if (state.currentTimeFilter && state.currentTimeFilter !== "any") {
    params.set("time", state.currentTimeFilter);
  }

  try {
    const res = await fetch(`/api/search/retry?${params.toString()}`);
    const data = await res.json();

    if (data.engineTimings) {
      state.currentData.engineTimings = data.engineTimings;
    }

    if (data.results && data.results.length > state.currentResults.length) {
      state.currentResults = data.results;
      state.currentData.results = data.results;
      if (data.atAGlance) state.currentData.atAGlance = data.atAGlance;

      document.getElementById("results-meta").textContent =
        `About ${data.results.length} results (${(state.currentData.totalTime / 1000).toFixed(2)} seconds)`;

      if (state.currentType === "all") {
        renderAtAGlance(state.currentData.atAGlance);
      }
      renderResults(data.results);
    }

    if (state.currentType === "all") {
      renderSidebar(state.currentData, (q) => performSearch(q));
    }
  } catch { }
}

function renderBangPagination(totalPages, activePage, query) {
  const container = document.getElementById("pagination");
  let html = '<div class="pagination"><div class="pagination-pages">';
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
  html += '</div></div>';
  container.innerHTML = html;
  container.querySelectorAll("[data-page]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const pageNum = parseInt(el.dataset.page, 10);
      if (pageNum >= 1 && pageNum <= totalPages) {
        performBangCommand(query, null, pageNum);
      }
    });
  });
}

export async function performLucky(query) {
  if (!query.trim()) return;
  const engines = await getEngines();
  const params = new URLSearchParams({ q: query });
  for (const [key, val] of Object.entries(engines)) {
    params.set(key, String(val));
  }
  window.location.href = `/api/lucky?${params.toString()}`;
}

function skeletonCard() {
  return `<div class="skeleton-card">
    <div class="skeleton-line skeleton-line--url"></div>
    <div class="skeleton-line skeleton-line--title"></div>
    <div class="skeleton-line skeleton-line--snippet"></div>
    <div class="skeleton-line skeleton-line--snippet-short"></div>
  </div>`;
}

function skeletonResults(count = 5) {
  return `<div class="skeleton-results">${Array.from({ length: count }, skeletonCard).join("")}</div>`;
}

function skeletonGlance() {
  return `<div class="glance-box">
    <div class="skeleton-glance">
      <div class="skeleton-line skeleton-line--title"></div>
      <div class="skeleton-line skeleton-line--snippet"></div>
      <div class="skeleton-line skeleton-line--snippet"></div>
      <div class="skeleton-line skeleton-line--snippet-short"></div>
    </div>
  </div>`;
}

let glanceAbortController = null;

async function fetchGlancePanels(query, results, fallbackAtAGlance) {
  if (glanceAbortController) glanceAbortController.abort();
  glanceAbortController = new AbortController();
  const signal = glanceAbortController.signal;
  const glanceEl = document.getElementById("at-a-glance");
  if (!results || results.length === 0) {
    if (glanceEl && fallbackAtAGlance) renderAtAGlance(fallbackAtAGlance);
    return;
  }
  if (glanceEl) glanceEl.innerHTML = skeletonGlance();
  try {
    const res = await fetch("/api/slots/glance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: query.trim(), results }),
      signal,
    });
    if (signal.aborted) return;
    const data = await res.json();
    if (signal.aborted) return;
    if (!glanceEl) return;
    if (data.panels && data.panels.length > 0) {
      for (const panel of data.panels) {
        if (panel.position === "at-a-glance") glanceEl.innerHTML = panel.html;
      }
    } else if (fallbackAtAGlance) {
      renderAtAGlance(fallbackAtAGlance);
    }
  } catch (err) {
    if (err.name === "AbortError") return;
    if (glanceEl && fallbackAtAGlance) renderAtAGlance(fallbackAtAGlance);
  }
}

async function fetchSlotPanels(query) {
  try {
    const res = await fetch("/api/slots?q=" + encodeURIComponent(query));
    if (!res.ok) return;
    const data = await res.json();
    if (data.panels && data.panels.length > 0) {
      appendSlotPanels(data.panels);
    }
  } catch { }
}

function escapeHtmlSimple(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}