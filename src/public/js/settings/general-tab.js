import { idbGet, idbSet } from "../db.js";
import { SETTINGS_KEY, THEME_KEY } from "../constants.js";
import { applyTheme } from "../theme.js";
import { requestInstallPrompt } from "../installPrompt.js";

export async function initGeneralTab() {
  const themeSelect = document.getElementById("theme-select");
  if (themeSelect) {
    const saved = await idbGet(THEME_KEY);
    themeSelect.value = saved || "system";
  }

  document.getElementById("settings-save").addEventListener("click", async () => {
    if (themeSelect) {
      await idbSet(THEME_KEY, themeSelect.value);
      applyTheme(themeSelect.value);
    }
    const btn = document.getElementById("settings-save");
    const prev = btn.textContent;
    btn.textContent = "Saved";
    setTimeout(() => { btn.textContent = prev; }, 1200);
  });

  document.getElementById("settings-cache-clear").addEventListener("click", async () => {
    const btn = document.getElementById("settings-cache-clear");
    try {
      await fetch("/api/cache/clear", { method: "POST" });
      const prev = btn.textContent;
      btn.textContent = "Cleared";
      setTimeout(() => { btn.textContent = prev; }, 1500);
    } catch {
      btn.textContent = "Failed";
    }
  });

  const installPromptBtn = document.getElementById("settings-install-prompt");
  if (installPromptBtn) {
    installPromptBtn.addEventListener("click", () => requestInstallPrompt());
  }
}
