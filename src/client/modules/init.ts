import { initLuckyAnimation } from "../animations/lucky-animation";
import {
  DISPLAY_ENGINE_PERFORMANCE,
  DISPLAY_SEARCH_SUGGESTIONS,
  OPEN_IN_NEW_TAB_KEY,
  POST_METHOD_ENABLED,
} from "../constants";
import { state } from "../state";
import { initAutocomplete } from "../utils/autocomplete";
import { idbGet } from "../utils/db";
import { recordSettingsReturn, showHome } from "../utils/navigation";
import { performSearch } from "../utils/search-actions";
import { initTheme } from "../utils/theme";
import { initOptionsDropdown } from "../utils/time-filter";
import { initMediaPreview } from "./media/media-preview";
import { performTabSearch } from "./tabs/tab-search";
import { initTabs } from "./tabs/tabs";

import { copyTextToClipboard } from "../utils/clipboard";
import { initInstallPrompt } from "../utils/install-prompt";
import { focusInput, initKeyboardShortcuts } from "../utils/keyboard-shortcuts";
import { initSearchBarActions } from "../utils/search-bar-actions";
import { renderPageTemplates } from "./renderer/render-page";
import { initResultActions } from "./result-actions";
import { getBase } from "../utils/base-url";

type DegoogHistoryState = {
  degoog: boolean;
  query: string;
  type: string;
  page: number;
};

export function init(): void {
  renderPageTemplates();

  document.body.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
      if (!a) return;
      let url: URL;
      try {
        url = new URL(a.href);
      } catch {
        return;
      }
      if (url.origin !== location.origin) return;
      if (!url.pathname.startsWith("/settings")) return;
      recordSettingsReturn();
    },
    true,
  );

  const searchInput = document.getElementById(
    "search-input",
  ) as HTMLInputElement | null;
  const resultsInput = document.getElementById(
    "results-search-input",
  ) as HTMLInputElement | null;

  document
    .getElementById("search-form-home")
    ?.addEventListener("submit", (e) => {
      e.preventDefault();
      const query = searchInput?.value.trim();
      if (!query) return;
      if (state.postMethodEnabled) {
        // Little hack to ensure we do not send the query in the URL
        sessionStorage.setItem("degoog-post-query", query);
        window.location.href = `${getBase()}/search`;
      } else {
        window.location.href = `${getBase()}/search?${new URLSearchParams({ q: query }).toString()}`;
      }
    });

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
    (q) => {
      if (searchInput) searchInput.value = q;
      document
        .getElementById("search-form-home")
        ?.dispatchEvent(
          new Event("submit", { cancelable: true, bubbles: true }),
        );
    },
  );
  initAutocomplete(
    resultsInput,
    document.getElementById("ac-dropdown-results"),
    (q) => void performSearch(q),
  );
  initSearchBarActions();
  initKeyboardShortcuts();
  focusInput(resultsInput);
  initLuckyAnimation();
  initTabs();
  initMediaPreview();
  void initTheme();
  initOptionsDropdown();
  initInstallPrompt();
  initResultActions();

  void idbGet<boolean>(OPEN_IN_NEW_TAB_KEY).then((v) => {
    if (v !== null) state.openInNewTab = v;
  });
  void idbGet<boolean>(DISPLAY_ENGINE_PERFORMANCE).then((v) => {
    if (v !== null) state.displayEnginePerformance = v;
  });
  void idbGet<boolean>(DISPLAY_SEARCH_SUGGESTIONS).then((v) => {
    if (v !== null) state.displaySearchSuggestions = v;
  });
  void idbGet<boolean>(POST_METHOD_ENABLED).then((v) => {
    if (v !== null) state.postMethodEnabled = v;
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
    void copyTextToClipboard(uuid).then((ok) => {
      if (ok) done();
    });
  });

  const params = new URLSearchParams(window.location.search);
  const q = params.get("q");
  const postQuery = sessionStorage.getItem("degoog-post-query");
  const postType = sessionStorage.getItem("degoog-post-type");
  const postPage = sessionStorage.getItem("degoog-post-page");

  if (postQuery) sessionStorage.removeItem("degoog-post-query");
  if (postType) sessionStorage.removeItem("degoog-post-type");
  if (postPage) sessionStorage.removeItem("degoog-post-page");

  const resolvedQ = q || postQuery;
  const type = params.get("type") || postType || "web";
  const page = parseInt(params.get("page") ?? postPage ?? "1", 10) || 1;
  if (resolvedQ) {
    state.isInitialLoad = true;
    if (searchInput) searchInput.value = resolvedQ;
    if (type.startsWith("tab:")) {
      void (async () => {
        const { getPluginTabIds } = await import("./tabs/tabs");
        await getPluginTabIds();
        performTabSearch(resolvedQ, type.slice(4), page);
      })();
    } else {
      void performSearch(resolvedQ, type, page);
    }
  } else if (state.postMethodEnabled && !state.currentQuery) {
    const hs = window.history.state as DegoogHistoryState | null;
    if (hs?.degoog && hs.query) {
      state.isInitialLoad = true;
      if (searchInput) searchInput.value = hs.query;
      if (resultsInput) resultsInput.value = hs.query;
      if (hs.type?.startsWith("tab:")) {
        void performTabSearch(hs.query, hs.type.slice(4), hs.page);
      } else {
        void performSearch(hs.query, hs.type, hs.page);
      }
    }
  }

  window.addEventListener("pageshow", () => {
    const restoredParams = new URLSearchParams(window.location.search);
    const restoredQ = restoredParams.get("q");
    if (restoredQ) {
      if (searchInput && !searchInput.value) {
        searchInput.value = restoredQ;
        searchInput.defaultValue = restoredQ;
      }
      if (resultsInput && !resultsInput.value) {
        resultsInput.value = restoredQ;
        resultsInput.defaultValue = restoredQ;
      }
      return;
    }

    if (!state.postMethodEnabled) return;
    if (state.currentQuery || state.currentData) return;

    const hs = window.history.state as DegoogHistoryState | null;
    if (hs?.degoog && hs.query) {
      state.isInitialLoad = true;
      if (searchInput && !searchInput.value) searchInput.value = hs.query;
      if (resultsInput && !resultsInput.value) resultsInput.value = hs.query;
      if (hs.type?.startsWith("tab:")) {
        void performTabSearch(hs.query, hs.type.slice(4), hs.page);
      } else {
        void performSearch(hs.query, hs.type, hs.page);
      }
    }
  });

  window.addEventListener("popstate", (e) => {
    const hs = e.state as DegoogHistoryState | null;
    if (hs?.degoog) {
      state.isInitialLoad = true;
      if (hs.type?.startsWith("tab:")) {
        void performTabSearch(hs.query, hs.type.slice(4), hs.page);
      } else {
        void performSearch(hs.query, hs.type, hs.page);
      }
      return;
    }
    const popParams = new URLSearchParams(window.location.search);
    const popQ = popParams.get("q");
    if (popQ) {
      const popType = popParams.get("type") || "web";
      const popPage = parseInt(popParams.get("page") ?? "1", 10) || 1;
      state.isInitialLoad = true;
      if (popType.startsWith("tab:")) {
        void performTabSearch(popQ, popType.slice(4), popPage);
      } else {
        void performSearch(popQ, popType, popPage);
      }
      return;
    }

    if (state.postMethodEnabled) {
      window.location.reload();
    }
  });
}
