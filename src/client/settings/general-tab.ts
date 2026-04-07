import { idbGet, idbSet } from "../utils/db";
import {
  THEME_KEY,
  OPEN_IN_NEW_TAB_KEY,
  DISPLAY_ENGINE_PERFORMANCE,
  DISPLAY_SEARCH_SUGGESTIONS,
} from "../constants";
import { applyTheme } from "../utils/theme";
import { requestInstallPrompt } from "../utils/install-prompt";

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
      } catch {}
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
        if (!token) throw new Error("missing token");
        await fetch("/api/settings/general", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-settings-token": token,
          },
          body: JSON.stringify({ defaultTheme: value }),
        });
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
    displayEnginePerformance.checked = saved || false;
    displayEnginePerformance.addEventListener("change", async () => {
      await idbSet(
        DISPLAY_ENGINE_PERFORMANCE,
        displayEnginePerformance.checked,
      );
    });
  }

  const displaySearchSuggestions = document.getElementById(
    "display-search-suggestions",
  ) as HTMLInputElement | null;
  if (displaySearchSuggestions) {
    const saved = await idbGet<boolean>(DISPLAY_SEARCH_SUGGESTIONS);
    displaySearchSuggestions.checked = saved || false;
    displaySearchSuggestions.addEventListener("change", async () => {
      await idbSet(
        DISPLAY_SEARCH_SUGGESTIONS,
        displaySearchSuggestions.checked,
      );
    });
  }
}

export async function initGeneralTab(): Promise<void> {
  await initAppearanceSettings();

  document
    .getElementById("settings-install-prompt")
    ?.addEventListener("click", () => requestInstallPrompt());
}
