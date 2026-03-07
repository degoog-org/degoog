import { performSearch } from "./search.js";
import { showHome } from "./navigation.js";
import { initAutocomplete } from "./autocomplete.js";
import { initLuckySlot } from "./luckySlot.js";
import { initTabs } from "./tabs.js";
import { initMediaPreview } from "./mediaPreview.js";
import { initTheme } from "./theme.js";
import { initTimeFilter } from "./timeFilter.js";
import { initHomeFeed } from "./homeFeed.js";
import { initInstallPrompt } from "./installPrompt.js";

function copyToClipboardFallback(text, onSuccess) {
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.left = "-9999px";
  document.body.appendChild(el);
  el.select();
  try {
    document.execCommand("copy");
    onSuccess();
  } finally {
    document.body.removeChild(el);
  }
}

export function init() {
  const searchInput = document.getElementById("search-input");
  const resultsInput = document.getElementById("results-search-input");

  resultsInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") performSearch(resultsInput.value);
  });

  document.getElementById("results-search-btn").addEventListener("click", () => {
    performSearch(resultsInput.value);
  });

  document.querySelector(".results-logo").addEventListener("click", (e) => {
    e.preventDefault();
    showHome();
    searchInput.value = "";
    searchInput.focus();
  });

  initAutocomplete(searchInput, document.getElementById("ac-dropdown-home"), performSearch);
  initAutocomplete(resultsInput, document.getElementById("ac-dropdown-results"), performSearch);
  initLuckySlot();
  initTabs();
  initMediaPreview();
  initTheme();
  initTimeFilter();
  initInstallPrompt();

  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest(".uuid-copy");
    if (!btn || !btn.dataset.uuid) return;
    e.preventDefault();
    e.stopPropagation();
    const uuid = btn.dataset.uuid;
    const done = () => {
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = "Copy"; }, 1500);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(uuid).then(done).catch(() => {
        copyToClipboardFallback(uuid, done);
      });
    } else {
      copyToClipboardFallback(uuid, done);
    }
  });

  const params = new URLSearchParams(window.location.search);
  const q = params.get("q");
  const type = params.get("type") || "all";
  const page = parseInt(params.get("page"), 10) || 1;
  if (q) {
    searchInput.value = q;
    performSearch(q, type, page);
  } else {
    initHomeFeed();
  }
}
