import { idbGet, idbSet } from "../utils/db";
import { THEME_KEY, OPEN_IN_NEW_TAB_KEY } from "../constants";
import { applyTheme } from "../utils/theme";
import { requestInstallPrompt } from "../utils/install-prompt";
import { authHeaders, jsonHeaders } from "../utils/request";

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
}

export async function initGeneralTab(
  getToken: () => string | null,
): Promise<void> {
  const themeSelect = document.getElementById(
    "theme-select",
  ) as HTMLSelectElement | null;
  if (themeSelect) {
    const saved = await idbGet<string>(THEME_KEY);
    themeSelect.value = saved || "system";
  }

  const openInNewTab = document.getElementById(
    "settings-open-new-tab",
  ) as HTMLInputElement | null;
  if (openInNewTab) {
    const saved = await idbGet<boolean>(OPEN_IN_NEW_TAB_KEY);
    openInNewTab.checked = saved || false;
  }

  const proxyEnabled = document.getElementById(
    "settings-proxy-enabled",
  ) as HTMLInputElement | null;
  const proxyUrlsWrap = document.getElementById("settings-proxy-urls-wrap");
  const proxyUrls = document.getElementById(
    "settings-proxy-urls",
  ) as HTMLTextAreaElement | null;
  const rateLimitEnabled = document.getElementById(
    "settings-rate-limit-enabled",
  ) as HTMLInputElement | null;
  const rateLimitOptions = document.getElementById(
    "settings-rate-limit-options",
  );
  const rateLimitBurstWindow = document.getElementById(
    "settings-rate-limit-burst-window",
  ) as HTMLInputElement | null;
  const rateLimitBurstMax = document.getElementById(
    "settings-rate-limit-burst-max",
  ) as HTMLInputElement | null;
  const rateLimitLongWindow = document.getElementById(
    "settings-rate-limit-long-window",
  ) as HTMLInputElement | null;
  const rateLimitLongMax = document.getElementById(
    "settings-rate-limit-long-max",
  ) as HTMLInputElement | null;

  const languagesEnabled = document.getElementById(
    "settings-languages-enabled",
  ) as HTMLInputElement | null;
  const languagesWrap = document.getElementById("settings-languages-wrap");
  const languagesTextarea = document.getElementById(
    "settings-languages",
  ) as HTMLTextAreaElement | null;

  if (proxyEnabled && proxyUrlsWrap && proxyUrls) {
    try {
      const res = await fetch("/api/settings/general", {
        headers: authHeaders(getToken),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          proxyEnabled?: string;
          proxyUrls?: string;
          rateLimitEnabled?: string;
          rateLimitBurstWindow?: string;
          rateLimitBurstMax?: string;
          rateLimitLongWindow?: string;
          rateLimitLongMax?: string;
          languagesEnabled?: string;
          languages?: string;
        };
        if (languagesEnabled && languagesWrap) {
          languagesEnabled.checked = data.languagesEnabled === "true";
          languagesWrap.style.display = languagesEnabled.checked ? "block" : "none";
        }
        if (languagesTextarea) languagesTextarea.value = data.languages ?? "";
        proxyEnabled.checked = data.proxyEnabled === "true";
        proxyUrls.value = data.proxyUrls ?? "";
        proxyUrlsWrap.style.display = proxyEnabled.checked ? "block" : "none";
        if (rateLimitEnabled && rateLimitOptions) {
          rateLimitEnabled.checked = data.rateLimitEnabled === "true";
          rateLimitOptions.style.display = rateLimitEnabled.checked
            ? "block"
            : "none";
        }
        if (rateLimitBurstWindow)
          rateLimitBurstWindow.value = data.rateLimitBurstWindow ?? "";
        if (rateLimitBurstMax)
          rateLimitBurstMax.value = data.rateLimitBurstMax ?? "";
        if (rateLimitLongWindow)
          rateLimitLongWindow.value = data.rateLimitLongWindow ?? "";
        if (rateLimitLongMax)
          rateLimitLongMax.value = data.rateLimitLongMax ?? "";
      }
    } catch {}
    proxyEnabled.addEventListener("change", () => {
      proxyUrlsWrap.style.display = proxyEnabled?.checked ? "block" : "none";
    });
  }
  if (languagesEnabled && languagesWrap) {
    languagesEnabled.addEventListener("change", () => {
      languagesWrap.style.display = languagesEnabled.checked ? "block" : "none";
    });
  }
  if (rateLimitEnabled && rateLimitOptions) {
    rateLimitEnabled.addEventListener("change", () => {
      rateLimitOptions.style.display = rateLimitEnabled.checked
        ? "block"
        : "none";
    });
  }

  const _rateLimitPayload = (): Record<string, string> => {
    const payload: Record<string, string> = {
      rateLimitEnabled: rateLimitEnabled?.checked ? "true" : "false",
    };
    if (
      rateLimitEnabled?.checked &&
      rateLimitBurstWindow &&
      rateLimitBurstMax &&
      rateLimitLongWindow &&
      rateLimitLongMax
    ) {
      const bw = rateLimitBurstWindow.value.trim();
      const bm = rateLimitBurstMax.value.trim();
      const lw = rateLimitLongWindow.value.trim();
      const lm = rateLimitLongMax.value.trim();
      if (bw) payload.rateLimitBurstWindow = bw;
      if (bm) payload.rateLimitBurstMax = bm;
      if (lw) payload.rateLimitLongWindow = lw;
      if (lm) payload.rateLimitLongMax = lm;
    }
    return payload;
  };

  document
    .getElementById("settings-save")
    ?.addEventListener("click", async () => {
      if (themeSelect) {
        const value = themeSelect.value;
        await idbSet(THEME_KEY, value);
        try {
          localStorage.setItem(THEME_KEY, value);
        } catch {}
        applyTheme(value);
      }
      if (openInNewTab) {
        await idbSet(OPEN_IN_NEW_TAB_KEY, openInNewTab.checked);
      }
      if (proxyEnabled && proxyUrls) {
        try {
          await fetch("/api/settings/general", {
            method: "POST",
            headers: jsonHeaders(getToken),
            body: JSON.stringify({
              proxyEnabled: proxyEnabled.checked ? "true" : "false",
              proxyUrls: proxyUrls.value.trim(),
              languagesEnabled: languagesEnabled?.checked ? "true" : "false",
              languages: languagesTextarea?.value.trim() ?? "",
              ..._rateLimitPayload(),
            }),
          });
        } catch {}
      }
      const btn = document.getElementById("settings-save");
      if (btn) {
        const prev = btn.textContent;
        btn.textContent = "Saved";
        setTimeout(() => {
          btn.textContent = prev;
        }, 1200);
      }
    });

  document
    .getElementById("settings-cache-clear")
    ?.addEventListener("click", async () => {
      const btn = document.getElementById("settings-cache-clear");
      try {
        await fetch("/api/cache/clear", { method: "POST" });
        if (btn) {
          const prev = btn.textContent;
          btn.textContent = "Cleared";
          setTimeout(() => {
            btn.textContent = prev;
          }, 1500);
        }
      } catch {
        if (btn) btn.textContent = "Failed";
      }
    });

  document
    .getElementById("settings-install-prompt")
    ?.addEventListener("click", () => requestInstallPrompt());
}
