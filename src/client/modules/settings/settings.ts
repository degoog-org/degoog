import { initTheme } from "../../utils/theme";
import { initInstallPrompt } from "../../utils/install-prompt";
import {
  initGeneralTab,
  initAppearanceSettings,
} from "../../settings/general-tab";
import { initEnginesTab } from "../../settings/engines-tab";
import { initPluginsTab } from "../../settings/plugins-tab";
import { initTransportsTab } from "../../settings/transports-tab";
import { initThemesTab } from "../../settings/themes-tab";
import { initServerTab } from "../../settings/server-tab";
import { initStoreTab } from "../../settings/store-tab";
import "../modals/settings-modal/modal";
import { SETTINGS_TABS } from "../../../shared/settings-tabs";
import type { AllExtensions } from "../../types";
import { navigateSettingsBack } from "../../utils/navigation";

declare global {
  interface Window {
    __DEGOOG_PUBLIC_INSTANCE__?: boolean;
    scopedT: (
      namespace: string,
    ) => (key: string, vars?: Record<string, string> | string[]) => string;
  }
}

const t = window.scopedT("core");

const TOKEN_KEY = "degoog-settings-token";

function _initSettingsBackLink(): void {
  document.body.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>(
      "a.settings-page-back",
    );
    if (!a) return;
    e.preventDefault();
    navigateSettingsBack();
  });
}

export const getStoredToken = (): string | null =>
  sessionStorage.getItem(TOKEN_KEY) || null;

const _checkAuth = async (): Promise<{
  required: boolean;
  valid: boolean;
  loginUrl?: string;
}> => {
  const token = getStoredToken();
  const headers = token ? { "x-settings-token": token } : {};
  const res = await fetch("/api/settings/auth", {
    headers: headers as Record<string, string>,
  });
  return res.json() as Promise<{
    required: boolean;
    valid: boolean;
    loginUrl?: string;
  }>;
};

function _showAuthGate(): void {
  const page = document.querySelector<HTMLElement>(".settings-page");
  if (!page) return;
  page.innerHTML = `
    <header class="settings-page-header">
      <a href="/" class="settings-page-back">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        ${t("settings-page.back")}
      </a>
      <h1 class="settings-page-title">${t("settings-page.page-title")}</h1>
    </header>
    <div class="settings-auth-gate">
      <div class="settings-auth-gate-inner">
        <p class="settings-auth-desc">${t("settings-page.gate.desc")}</p>
        <form class="settings-auth-form" id="settings-auth-form" autocomplete="off">
          <input class="settings-auth-input" type="password" id="settings-auth-input" placeholder="${t("settings-page.gate.password-placeholder")}" autocomplete="current-password" autofocus>
          <button class="settings-auth-submit" type="submit">${t("settings-page.gate.unlock")}</button>
        </form>
        <p class="settings-auth-error" id="settings-auth-error"></p>
      </div>
    </div>`;

  document
    .getElementById("settings-auth-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const password = (
        document.getElementById(
          "settings-auth-input",
        ) as HTMLInputElement | null
      )?.value;
      const errorEl = document.getElementById("settings-auth-error");
      if (errorEl) errorEl.textContent = "";
      try {
        const res = await fetch("/api/settings/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        const data = (await res.json()) as { ok?: boolean; token?: string };
        if (data.ok && data.token) {
          sessionStorage.setItem(TOKEN_KEY, data.token);
          window.location.reload();
        } else {
          if (errorEl)
            errorEl.textContent = t("settings-page.gate.incorrect-password");
        }
      } catch {
        if (errorEl)
          errorEl.textContent = t("settings-page.gate.network-error");
      }
    });
}

function _switchSettingsTab(value: string, updateUrl = true): void {
  document
    .querySelectorAll<HTMLElement>(".settings-tab-panel")
    .forEach((p) => p.classList.remove("active"));
  document.getElementById(`tab-${value}`)?.classList.add("active");
  document.querySelectorAll<HTMLElement>(".settings-nav-item").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === value);
  });
  const select = document.getElementById(
    "settings-tab-select",
  ) as HTMLSelectElement | null;
  if (select) select.value = value;

  if (updateUrl) {
    const path = value === "general" ? "/settings" : `/settings/${value}`;
    window.history.replaceState({}, "", path);
  }
}

function _initTabs(): void {
  const select = document.getElementById(
    "settings-tab-select",
  ) as HTMLSelectElement | null;
  const nav = document.getElementById("settings-tabs-nav");
  select?.addEventListener("change", () => _switchSettingsTab(select.value));
  nav?.querySelectorAll<HTMLElement>(".settings-nav-item").forEach((btn) => {
    btn.addEventListener("click", () =>
      _switchSettingsTab(btn.dataset.tab ?? "general"),
    );
  });

  const path = window.location.pathname;
  const match = path.match(/^\/settings\/(\w+)$/);
  if (match) {
    const tab = match[1];
    if ((SETTINGS_TABS as readonly string[]).includes(tab)) {
      _switchSettingsTab(tab, false);
    }
  }
}

async function _initSettings(): Promise<void> {
  void initTheme();
  initInstallPrompt();
  _initTabs();
  void initGeneralTab();
  void initServerTab(getStoredToken);

  try {
    const [extRes, themesRes] = await Promise.all([
      fetch("/api/extensions", {
        headers: getStoredToken()
          ? { "x-settings-token": getStoredToken()! }
          : {},
      }),
      fetch("/api/themes"),
    ]);
    const allExtensions = (await extRes.json()) as AllExtensions;
    const themesData = (await themesRes.json()) as { activeId: string | null };
    await initEnginesTab(allExtensions);
    initPluginsTab(allExtensions);
    initTransportsTab(allExtensions);
    await initThemesTab(themesData, allExtensions.themes ?? []);
    const storeEl = document.getElementById("store-content");
    if (storeEl) void initStoreTab(storeEl, getStoredToken);
  } catch {
    const enginesEl = document.getElementById("engines-content");
    const pluginsEl = document.getElementById("plugins-content");
    const transportsEl = document.getElementById("transports-content");
    const themesEl = document.getElementById("themes-content");
    if (enginesEl)
      enginesEl.innerHTML = `<p>${t("settings-page.errors.load-extensions")}</p>`;
    if (pluginsEl)
      pluginsEl.innerHTML = `<p>${t("settings-page.errors.load-extensions")}</p>`;
    if (transportsEl)
      transportsEl.innerHTML = `<p>${t("settings-page.errors.load-transports")}</p>`;
    if (themesEl)
      themesEl.innerHTML = `<p>${t("settings-page.errors.load-themes")}</p>`;
  }
}

window.addEventListener("extensions-saved", async () => {
  try {
    const res = await fetch("/api/extensions", {
      headers: getStoredToken()
        ? { "x-settings-token": getStoredToken()! }
        : {},
    });
    const allExtensions = (await res.json()) as AllExtensions;
    await initEnginesTab(allExtensions);
    initPluginsTab(allExtensions);
    initTransportsTab(allExtensions);
  } catch {}
});

async function _initPublicSettings(): Promise<void> {
  void initTheme();
  void initAppearanceSettings();
  try {
    const res = await fetch("/api/extensions");
    const allExtensions = (await res.json()) as AllExtensions;
    await initEnginesTab(allExtensions, { publicInstance: true });
  } catch {
    const enginesEl = document.getElementById("engines-content");
    if (enginesEl)
      enginesEl.innerHTML = `<p>${t("settings-page.errors.load-engines")}</p>`;
  }
}

async function _init(): Promise<void> {
  _initSettingsBackLink();
  if (window.__DEGOOG_PUBLIC_INSTANCE__) {
    void _initPublicSettings();
    return;
  }
  void initTheme();
  const params = new URLSearchParams(window.location.search);
  const tokenFromUrl = params.get("token");
  if (tokenFromUrl) {
    sessionStorage.setItem(TOKEN_KEY, tokenFromUrl);
    window.history.replaceState({}, "", "/settings");
  }
  const auth = await _checkAuth();
  if (auth.required && !auth.valid) {
    if (auth.loginUrl) {
      window.location.href = auth.loginUrl;
      return;
    }
    _showAuthGate();
  } else {
    void _initSettings();
  }
}

void _init();
