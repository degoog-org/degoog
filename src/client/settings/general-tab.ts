import {
  DISPLAY_ENGINE_PERFORMANCE,
  DISPLAY_SEARCH_SUGGESTIONS,
  OPEN_IN_NEW_TAB_KEY,
  POST_METHOD_ENABLED,
  THEME_KEY,
} from "../constants";
import { idbGet, idbSet } from "../utils/db";
import { requestInstallPrompt } from "../utils/install-prompt";
import { applyTheme } from "../utils/theme";

const t = window.scopedT("core");

export async function initAppearanceSettings(): Promise<void> {
  const themeSelect = document.getElementById(
    "theme-select",
  ) as HTMLSelectElement | null;
  if (themeSelect) {
    const saved = await idbGet<string>(THEME_KEY);
    themeSelect.value = saved || "system";
    themeSelect.addEventListener("change", async () => {
      const value = themeSelect.value;
      await idbSet(THEME_KEY, value);
      try {
        localStorage.setItem(THEME_KEY, value);
      } catch { }
      applyTheme(value);
    });
  }

  document
    .getElementById("save-default-theme")
    ?.addEventListener("click", async () => {
      const btn = document.getElementById("save-default-theme");
      const select = document.getElementById(
        "theme-select",
      ) as HTMLSelectElement | null;
      const value = select?.value ?? "system";
      try {
        const token = sessionStorage.getItem("degoog-settings-token");
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (token) headers["x-settings-token"] = token;
        const res = await fetch("/api/settings/general", {
          method: "POST",
          headers,
          body: JSON.stringify({ defaultTheme: value }),
        });
        if (!res.ok) throw new Error("save failed");
        if (btn) {
          const prev = btn.textContent;
          btn.textContent = t("settings-page.server.saved");
          setTimeout(() => {
            btn.textContent = prev;
          }, 1200);
        }
      } catch {
        if (btn)
          btn.textContent = t("settings-page.server.save-failed-network");
      }
    });

  const openInNewTab = document.getElementById(
    "settings-open-new-tab",
  ) as HTMLInputElement | null;
  if (openInNewTab) {
    const saved = await idbGet<boolean>(OPEN_IN_NEW_TAB_KEY);
    openInNewTab.checked = saved || false;
    openInNewTab.addEventListener("change", async () => {
      await idbSet(OPEN_IN_NEW_TAB_KEY, openInNewTab.checked);
    });
  }

  const displayEnginePerformance = document.getElementById(
    "display-engine-performance",
  ) as HTMLInputElement | null;
  if (displayEnginePerformance) {
    const saved = await idbGet<boolean>(DISPLAY_ENGINE_PERFORMANCE);
    displayEnginePerformance.checked = saved ?? true;
    displayEnginePerformance.addEventListener("change", async () => {
      await idbSet(
        DISPLAY_ENGINE_PERFORMANCE,
        displayEnginePerformance.checked,
      );
    });
  }

  const displaySearchSuggestions = document.getElementById(
    "display-related-queries",
  ) as HTMLInputElement | null;
  if (displaySearchSuggestions) {
    const saved = await idbGet<boolean>(DISPLAY_SEARCH_SUGGESTIONS);
    displaySearchSuggestions.checked = saved ?? true;
    displaySearchSuggestions.addEventListener("change", async () => {
      await idbSet(
        DISPLAY_SEARCH_SUGGESTIONS,
        displaySearchSuggestions.checked,
      );
    });
  }

  const postMethodEnabled = document.getElementById(
    "settings-post-method-enabled",
  ) as HTMLInputElement | null;
  if (postMethodEnabled) {
    const saved = await idbGet<boolean>(POST_METHOD_ENABLED);
    postMethodEnabled.checked = saved || false;
    postMethodEnabled.addEventListener("change", async () => {
      await idbSet(POST_METHOD_ENABLED, postMethodEnabled.checked);
    });
  }
}

export async function initGeneralTab(): Promise<void> {
  await initAppearanceSettings();

  document
    .getElementById("settings-install-prompt")
    ?.addEventListener("click", () => requestInstallPrompt());
}
