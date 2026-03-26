import { performSearch } from "../utils/search-actions";
import { performTabSearch } from "./tabs/tab-search";
import { showHome } from "../utils/navigation";
import { initAutocomplete } from "../utils/autocomplete";
import { initLuckyAnimation } from "../animations/lucky-animation";
import { initTabs } from "./tabs/tabs";
import { initMediaPreview } from "./media/media-preview";
import { initTheme } from "../utils/theme";
import { initOptionsDropdown } from "../utils/time-filter";
import { idbGet } from "../utils/db";
import { OPEN_IN_NEW_TAB_KEY } from "../constants";
import { state } from "../state";

import { initInstallPrompt } from "../utils/install-prompt";
import { initSearchBarActions } from "../utils/search-bar-actions";

function _copyToClipboard(text: string, onSuccess: () => void): void {
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

export function init(): void {
  const searchInput = document.getElementById(
    "search-input",
  ) as HTMLInputElement | null;
  const resultsInput = document.getElementById(
    "results-search-input",
  ) as HTMLInputElement | null;

  resultsInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && resultsInput)
      void performSearch(resultsInput.value);
  });

  document
    .getElementById("results-search-btn")
    ?.addEventListener("click", () => {
      if (resultsInput) void performSearch(resultsInput.value);
    });

  document.querySelector(".results-logo")?.addEventListener("click", (e) => {
    e.preventDefault();
    showHome();
    if (searchInput) {
      searchInput.value = "";
      searchInput.focus();
    }
  });

  initAutocomplete(
    searchInput,
    document.getElementById("ac-dropdown-home"),
    (q) => void performSearch(q),
  );
  initAutocomplete(
    resultsInput,
    document.getElementById("ac-dropdown-results"),
    (q) => void performSearch(q),
  );
  initSearchBarActions();
  initLuckyAnimation();
  initTabs();
  initMediaPreview();
  void initTheme();
  initOptionsDropdown();
  initInstallPrompt();

  void idbGet<boolean>(OPEN_IN_NEW_TAB_KEY).then((v) => {
    if (v !== null) state.openInNewTab = v;
  });

  document.body.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(".uuid-copy");
    if (!btn || !btn.dataset.uuid) return;
    e.preventDefault();
    e.stopPropagation();
    const uuid = btn.dataset.uuid;
    const done = (): void => {
      btn.textContent = "Copied!";
      setTimeout(() => {
        btn.textContent = "Copy";
      }, 1500);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(uuid)
        .then(done)
        .catch(() => {
          _copyToClipboard(uuid, done);
        });
    } else {
      _copyToClipboard(uuid, done);
    }
  });

  const params = new URLSearchParams(window.location.search);
  const q = params.get("q");
  const type = params.get("type") || "all";
  const page = parseInt(params.get("page") ?? "1", 10) || 1;
  if (q) {
    if (searchInput) searchInput.value = q;
    if (type.startsWith("tab:")) {
      void (async () => {
        const { getPluginTabIds } = await import("./tabs/tabs");
        await getPluginTabIds();
        performTabSearch(q, type.slice(4), page);
      })();
    } else {
      void performSearch(q, type, page);
    }
  }
}
