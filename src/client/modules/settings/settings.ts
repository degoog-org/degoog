import { initTheme } from "../../utils/theme";
import { applyDefaults } from "../../utils/sync";
import { getBase } from "../../utils/base-url";
import { initInstallPrompt } from "../../utils/install-prompt";
import {
  initGeneralTab,
  initPublicGeneral,
  bindResetDefaults,
} from "../../settings/general/tab";
import { SYNC_KEYS } from "../../../shared/sync";
import { initEnginesTab } from "../../settings/engines/tab";
import { initPluginsTab } from "../../settings/plugins/tab";
import { initTransportsTab } from "../../settings/transports/tab";
import { initAutocompleteTab } from "../../settings/autocomplete/tab";
import { initThemesTab } from "../../settings/themes/tab";
import { initServerTab } from "../../settings/server/tab";
import { initStoreTab } from "../../settings/store/tab";
import { initIndexerTab } from "../../settings/indexer/tab";
import { initShortcutsTab } from "../../settings/shortcuts/tab";
import { initGlobalSearch } from "../../settings/shared/settings-search";
import {
  getStoredToken as _getStoredToken,
  SETTINGS_TOKEN_KEY,
} from "../../utils/settings-token";
import { initSettingsWizard } from "../wizard/wizard";
import "../modals/settings-modal/modal";
import type { AllExtensions } from "../../types";
import { navigateSettingsBack } from "../../utils/navigation";
import {
  getActiveSettingsTab,
  getSettingsRoot,
} from "../../utils/settings-path";

declare global {
  interface Window {
    __DEGOOG_PUBLIC_INSTANCE__?: boolean;
    scopedT: (
      namespace: string,
    ) => (key: string, vars?: Record<string, string> | string[]) => string;
  }
}

const t = window.scopedT("core");

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

export const getStoredToken = _getStoredToken;

const _checkAuth = async (): Promise<{
  required: boolean;
  valid: boolean;
  loginUrl?: string;
  error?: string;
}> => {
  const token = getStoredToken();
  const headers = token ? { "x-settings-token": token } : {};
  const res = await fetch(`${getBase()}/api/settings/auth`, {
    headers: headers as Record<string, string>,
  });
  return res.json() as Promise<{
    required: boolean;
    valid: boolean;
    loginUrl?: string;
    error?: string;
  }>;
};

function _showAuthMisconfigured(): void {
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
        <span class="settings-auth-lock settings-auth-lock--warn" aria-hidden="true">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </span>
        <p class="settings-auth-desc">${t("settings-page.gate.misconfigured")}</p>
      </div>
    </div>`;
}

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
        <span class="settings-auth-lock" aria-hidden="true">
          <i class="fa-solid fa-lock"></i>
        </span>
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
        const res = await fetch(`${getBase()}/api/settings/auth`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        const data = (await res.json()) as { ok?: boolean; token?: string };
        if (data.ok && data.token) {
          sessionStorage.setItem(SETTINGS_TOKEN_KEY, data.token);
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

export function switchSettingsTab(value: string, updateUrl = true): void {
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
    const root = getSettingsRoot();
    const path = value === "general" ? root : `${root}/${value}`;
    window.history.replaceState({}, "", path);
  }
}

function _initTabs(): void {
  const select = document.getElementById(
    "settings-tab-select",
  ) as HTMLSelectElement | null;
  const nav = document.getElementById("settings-tabs-nav");
  select?.addEventListener("change", () => switchSettingsTab(select.value));
  nav?.querySelectorAll<HTMLElement>(".settings-nav-item").forEach((btn) => {
    btn.addEventListener("click", () =>
      switchSettingsTab(btn.dataset.tab ?? "general"),
    );
  });

  const tab = getActiveSettingsTab();
  if (tab && tab !== "general") {
    switchSettingsTab(tab, false);
  }
}

function _initSettingsMainOffset(): void {
  const main = document.querySelector<HTMLElement>(".settings-page-main");
  const search = document.querySelector<HTMLElement>(".settings-nav-search");
  if (!main || !search) return;

  const desktop = window.matchMedia("(min-width: 768px)");
  let frame = 0;

  const sync = (): void => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      main.style.paddingTop = "";
      if (!desktop.matches) return;
      const offset = search.getBoundingClientRect().top - main.getBoundingClientRect().top;
      main.style.paddingTop = `${Math.max(0, offset)}px`;
    });
  };

  sync();
  window.addEventListener("resize", sync);
  desktop.addEventListener("change", sync);
  window.addEventListener("load", sync, { once: true });
  void document.fonts?.ready.then(sync);

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(sync);
    observer.observe(search);
    const header = document.querySelector<HTMLElement>(".settings-page-header");
    if (header) observer.observe(header);
  }
}

async function _initSettings(): Promise<void> {
  void initTheme();
  initInstallPrompt();
  _initTabs();
  _initSettingsMainOffset();
  void initGeneralTab(getStoredToken);
  void initServerTab(getStoredToken);
  void initShortcutsTab(getStoredToken);

  try {
    const [extRes, themesRes] = await Promise.all([
      fetch(`${getBase()}/api/extensions`, {
        headers: getStoredToken()
          ? { "x-settings-token": getStoredToken()! }
          : {},
      }),
      fetch(`${getBase()}/api/themes`),
    ]);
    const allExtensions = (await extRes.json()) as AllExtensions;
    const themesData = (await themesRes.json()) as { activeId: string | null };
    await initEnginesTab(allExtensions);
    initPluginsTab(allExtensions);
    initTransportsTab(allExtensions);
    initAutocompleteTab(allExtensions);
    await initThemesTab(themesData, allExtensions.themes ?? []);
    const storeEl = document.getElementById("store-content");
    if (storeEl) void initStoreTab(storeEl, getStoredToken);
    const indexerEl = document.getElementById("indexer-content");
    if (indexerEl) void initIndexerTab(indexerEl);
    initGlobalSearch();
    void initSettingsWizard();
  } catch {
    const enginesEl = document.getElementById("engines-content");
    const pluginsEl = document.getElementById("plugins-content");
    const transportsEl = document.getElementById("transports-content");
    const autocompleteEl = document.getElementById("autocomplete-content");
    const themesEl = document.getElementById("themes-content");
    if (enginesEl)
      enginesEl.innerHTML = `<p>${t("settings-page.errors.load-extensions")}</p>`;
    if (pluginsEl)
      pluginsEl.innerHTML = `<p>${t("settings-page.errors.load-extensions")}</p>`;
    if (transportsEl)
      transportsEl.innerHTML = `<p>${t("settings-page.errors.load-transports")}</p>`;
    if (autocompleteEl)
      autocompleteEl.innerHTML = `<p>${t("settings-page.errors.load-autocomplete")}</p>`;
    if (themesEl)
      themesEl.innerHTML = `<p>${t("settings-page.errors.load-themes")}</p>`;
  }
}

window.addEventListener("extensions-saved", async () => {
  try {
    const [extRes, themesRes] = await Promise.all([
      fetch(`${getBase()}/api/extensions`, {
        headers: getStoredToken()
          ? { "x-settings-token": getStoredToken()! }
          : {},
      }),
      fetch(`${getBase()}/api/themes`),
    ]);
    const allExtensions = (await extRes.json()) as AllExtensions;
    const themesData = (await themesRes.json()) as { activeId: string | null };
    await initEnginesTab(allExtensions);
    initPluginsTab(allExtensions);
    initTransportsTab(allExtensions);
    initAutocompleteTab(allExtensions);
    await initThemesTab(themesData, allExtensions.themes ?? []);
  } catch (err) {
    console.warn("[settings] extension tabs refresh failed", err);
  }
});

async function _renderPublicTabs(allExtensions: AllExtensions): Promise<void> {
  await initPublicGeneral();
  await initEnginesTab(allExtensions, { publicInstance: true });
  bindResetDefaults(SYNC_KEYS, () => _renderPublicTabs(allExtensions));
}

async function _initPublicSettings(): Promise<void> {
  await applyDefaults();
  void initTheme();
  try {
    const res = await fetch(`${getBase()}/api/extensions`);
    const allExtensions = (await res.json()) as AllExtensions;
    await _renderPublicTabs(allExtensions);
  } catch {
    const renderGeneralOnly = async (): Promise<void> => {
      await initPublicGeneral();
      bindResetDefaults(SYNC_KEYS, renderGeneralOnly);
    };
    await renderGeneralOnly();
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
    sessionStorage.setItem(SETTINGS_TOKEN_KEY, tokenFromUrl);
    window.history.replaceState({}, "", getSettingsRoot());
  }
  const auth = await _checkAuth();
  if (auth.required && !auth.valid) {
    if (auth.error === "auth-misconfigured") {
      _showAuthMisconfigured();
      return;
    }
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
