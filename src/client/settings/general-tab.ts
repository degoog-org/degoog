import pkg from "../../../package.json";
import {
  DISPLAY_ENGINE_PERFORMANCE,
  DISPLAY_SEARCH_SUGGESTIONS,
  OPEN_IN_NEW_TAB_KEY,
  POST_METHOD_ENABLED,
  THEME_KEY,
} from "../constants";
import { getBase } from "../utils/base-url";
import { idbGet, idbSet } from "../utils/db";
import { requestInstallPrompt } from "../utils/install-prompt";
import { applyTheme } from "../utils/theme";

const t = window.scopedT("core");

export async function initAppearanceSettings(): Promise<void> {
  const themeSelect = document.getElementById(
    "theme-select",
  ) as HTMLSelectElement | null;
  const saveDefaultBtn = document.getElementById(
    "save-default-theme",
  ) as HTMLButtonElement | null;

  if (saveDefaultBtn) saveDefaultBtn.style.display = "none";

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
      if (saveDefaultBtn) saveDefaultBtn.style.display = "";
    });
  }

  saveDefaultBtn?.addEventListener("click", async () => {
    const value =
      (document.getElementById("theme-select") as HTMLSelectElement | null)
        ?.value ?? "system";
    try {
      const token = sessionStorage.getItem("degoog-settings-token");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["x-settings-token"] = token;
      const res = await fetch(`${getBase()}/api/settings/general`, {
        method: "POST",
        headers,
        body: JSON.stringify({ defaultTheme: value }),
      });
      if (!res.ok) throw new Error("save failed");
      const prev = saveDefaultBtn.textContent;
      saveDefaultBtn.textContent = t("settings-page.server.saved");
      setTimeout(() => {
        saveDefaultBtn.textContent = prev;
        saveDefaultBtn.style.display = "none";
      }, 1200);
    } catch {
      saveDefaultBtn.textContent = t(
        "settings-page.server.save-failed-network",
      );
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

// Gets the current release tag
async function getNewestRelease() : Promise<string>{
  const tags = await fetch("https://api.github.com/repos/degoog-org/degoog/tags")
  if (tags){
    const json = await tags.json()
    if (json){
      const value = json[0].name;
      if (value)
        return value;
    }
  }
  return "Unknown";
}

// Initialize the things needed for the version checker
export async function initVersionChecker() : Promise<void>{
  const newestVersionB = document.getElementById(
    "settings-update-check-newestversion",
  ) as HTMLBRElement | null;
  const lastCheckedB = document.getElementById(
    "settings-update-check-lastchecked",
  ) as HTMLBRElement | null;
  const checkNowButton = document.getElementById(
    "settings-update-check-check",
  ) as HTMLButtonElement | null;
  const newAvailableP = document.getElementById(
    "settings-update-check-newversionavailable",
  ) as HTMLParagraphElement | null;

  let latestDate = new Date(0)
  const latest = localStorage.getItem("last-update-check");
  if (latest)
    latestDate = new Date(latest)
  const now = new Date();

  // If the latest date is more than 1 day ago, fetch the newest version and save it
  if (+now - +latestDate > (24 * 60 * 60 * 1000)){
    console.log("test")
    latestDate = new Date();
    localStorage.setItem("last-update-check", latestDate.toUTCString());
    const newCheck = await getNewestRelease();
    if (newestVersionB)
      newestVersionB.innerHTML = newCheck;
    localStorage.setItem("last-update-check-version", newCheck);
  }

  if (lastCheckedB)
    lastCheckedB.innerHTML = latestDate.toLocaleDateString();
  const currentVersion = localStorage.getItem("last-update-check-version");
  if (pkg.version != currentVersion && newAvailableP)
      newAvailableP.setAttribute("style","")

  // Update the visual for the latest version
  const latestVersion = localStorage.getItem("last-update-check-version");
  if (latestVersion && newestVersionB)
    newestVersionB.innerHTML = latestVersion;

  // Manual recheck button
  checkNowButton?.addEventListener("click", async () => {
    const newest = await getNewestRelease();
    if (newestVersionB)
      newestVersionB.innerHTML = newest;
    localStorage.setItem("last-update-check-version", newest);

    const newLatest = new Date();
    localStorage.setItem("last-update-check", newLatest.toUTCString());
    if (lastCheckedB)
      lastCheckedB.innerHTML = newLatest.toLocaleDateString();

    if (pkg.version != newest && newAvailableP)
      newAvailableP.setAttribute("style","")
  })
}

export async function initGeneralTab(): Promise<void> {
  await initAppearanceSettings();
  await initVersionChecker();

  document
    .getElementById("settings-install-prompt")
    ?.addEventListener("click", () => requestInstallPrompt());
}
