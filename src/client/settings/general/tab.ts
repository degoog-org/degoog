import pkg from "../../../../package.json";
import {
  DISPLAY_ENGINE_PERFORMANCE,
  DISPLAY_SEARCH_SUGGESTIONS,
  INLINE_GIF_PLAYBACK,
  OPEN_IN_NEW_TAB_KEY,
  POST_METHOD_ENABLED,
  STICKY_SIDEBAR,
  CENTERED_MODE,
  THEME_KEY,
} from "../../constants";
import { idbGet, idbSet } from "../../utils/db";
import { resetDefaults, saveDefaults } from "../../utils/sync";
import { SYNC_KEYS } from "../../../shared/sync";
import { requestInstallPrompt } from "../../utils/install-prompt";
import { applyTheme } from "../../utils/theme";
import { restartWizard } from "../../modules/wizard/wizard";
import { escapeHtml } from "../../utils/dom";
import { confirmModal } from "../../modules/modals/confirm-modal/confirm";
import type { ToggleOpts } from "../../types/settings-section";
import { renderCheckbox, renderSection } from "../shared/section";

const t = window.scopedT("core");

const SEARCH_OPTION_TOGGLES: ToggleOpts[] = [
  {
    id: "settings-open-new-tab",
    labelKey: "settings-page.search-options.open-new-tab",
    ariaKey: "settings-page.search-options.open-new-tab-aria",
  },
  {
    id: "display-engine-performance",
    labelKey: "settings-page.search-options.engine-performance",
    ariaKey: "settings-page.search-options.engine-performance-aria",
  },
  {
    id: "display-related-queries",
    labelKey: "settings-page.search-options.related-queries",
    ariaKey: "settings-page.search-options.related-queries-aria",
  },
  {
    id: "settings-inline-gif-playback",
    labelKey: "settings-page.search-options.inline-gif-playback",
    ariaKey: "settings-page.search-options.inline-gif-playback-aria",
  },
  {
    id: "settings-post-method-enabled",
    labelKey: "settings-page.search-options.post-method",
    ariaKey: "settings-page.search-options.post-method-aria",
    titleKey: "settings-page.search-options.post-method-tooltip",
  },
  {
    id: "settings-sticky-sidebar",
    labelKey: "settings-page.search-options.sticky-sidebar",
    ariaKey: "settings-page.search-options.sticky-sidebar-aria",
  },
  {
    id: "settings-centered-mode",
    labelKey: "settings-page.search-options.centered-mode",
    ariaKey: "settings-page.search-options.centered-mode-aria",
  },
];

const renderAppearanceSection = (): string => {
  const opts = ["system", "light", "dark"] as const;
  const optHtml = opts
    .map((v) => `<option value="${v}">${escapeHtml(t(`settings-page.theme.${v}`))}</option>`)
    .join("");
  const content = `
    <div class="theme-select-wrap degoog-select-wrap degoog-select-wrap--flex">
      <select id="theme-select" class="theme-select">${optHtml}</select>
    </div>`;
  return renderSection({
    icon: "fa-solid fa-palette",
    headingKey: "settings-page.appearance.heading",
    descKey: "settings-page.appearance.desc",
    fieldsetClass: "ext-card-main",
    content,
  });
};

const renderSearchOptionsSection = (): string =>
  renderSection({
    icon: "fa-solid fa-magnifying-glass",
    headingKey: "settings-page.search-options.heading",
    fieldsetClass: "settings-toggle-grid",
    content: SEARCH_OPTION_TOGGLES.map(renderCheckbox).join(""),
  });

const renderSyncSection = (): string =>
  renderSection({
    icon: "fa-solid fa-rotate",
    headingKey: "settings-page.sync.heading",
    descKey: "settings-page.sync.desc",
    noFieldset: true,
    content: `<div class="settings-page-actions">
      <button class="btn btn--secondary degoog-btn degoog-btn--secondary" id="settings-sync-save-defaults" type="button">
        ${escapeHtml(t("settings-page.sync.save-button"))}
      </button>
      ${renderResetBtn()}
    </div>`,
  });

const renderResetBtn = (): string =>
  `<button class="btn btn--secondary degoog-btn degoog-btn--secondary" id="settings-sync-reset-defaults" type="button">
    ${escapeHtml(t("settings-page.sync.reset-button"))}
  </button>`;

const renderResetSection = (): string =>
  renderSection({
    icon: "fa-solid fa-rotate",
    headingKey: "settings-page.sync.reset-heading",
    descKey: "settings-page.sync.reset-desc",
    noFieldset: true,
    content: renderResetBtn(),
  });

const renderWizardSection = (): string =>
  renderSection({
    icon: "fa-solid fa-route",
    headingKey: "settings-page.wizard.restart-heading",
    descKey: "settings-page.wizard.restart-desc",
    noFieldset: true,
    content: `<button class="btn btn--secondary degoog-btn degoog-btn--secondary" id="settings-wizard-restart" type="button">
      ${escapeHtml(t("settings-page.wizard.restart-button"))}
    </button>`,
  });

const renderInstallSection = (): string =>
  renderSection({
    icon: "fa-solid fa-download",
    headingKey: "settings-page.install.heading",
    descKey: "settings-page.install.desc",
    noFieldset: true,
    content: `<button class="btn btn--secondary degoog-btn degoog-btn--secondary settings-install-prompt" id="settings-install-prompt" type="button">
      ${escapeHtml(t("settings-page.install.prompt-button"))}
    </button>`,
  });

const renderUpdateSection = (): string => {
  const content = `
    <p id="settings-update-check-newversionavailable" style="display: none">
      <b>${escapeHtml(t("settings-page.update-check.new-desc"))}</b>
    </p>
    <p class="settings-desc">
      <b>${escapeHtml(pkg.version)}</b>
      ${escapeHtml(t("settings-page.update-check.desc"))}
      <b id="settings-update-check-newestversion">Unknown</b>
    </p>
    <p class="settings-desc">
      ${escapeHtml(t("settings-page.update-check.last-checked"))}:
      <b id="settings-update-check-lastchecked">Never</b>
    </p>
    <button class="btn btn--secondary degoog-btn degoog-btn--secondary" id="settings-update-check-check" type="button">
      ${escapeHtml(t("settings-page.update-check.check-now-button"))}
    </button>
    <a class="btn btn--secondary degoog-btn degoog-btn--secondary" type="button" target="_blank" href="https://github.com/degoog-org/degoog/releases/latest">
      ${escapeHtml(t("settings-page.update-check.open-link-button"))}
    </a>`;
  return renderSection({
    icon: "fa-solid fa-bell",
    headingKey: "settings-page.update-check.heading",
    noFieldset: true,
    content,
  });
};

const renderPublicAppearance = (): string => {
  const opts = ["system", "light", "dark"] as const;
  const optHtml = opts
    .map((v) => `<option value="${v}">${escapeHtml(t(`settings-page.theme.${v}`))}</option>`)
    .join("");
  return renderSection({
    headingKey: "settings-page.appearance.heading",
    descKey: "settings-page.appearance.desc",
    content: `
      <div class="theme-select-wrap degoog-select-wrap degoog-select-wrap--flex">
        <select id="theme-select" class="theme-select">${optHtml}</select>
      </div>`,
  });
};

const renderPublicSearchOptions = (): string =>
  renderSection({
    headingKey: "settings-page.search-options.heading",
    fieldsetClass: "settings-toggle-grid",
    content: SEARCH_OPTION_TOGGLES.map(renderCheckbox).join(""),
  });

export const renderGeneralContent = (): string =>
  [
    renderAppearanceSection(),
    renderSearchOptionsSection(),
    renderSyncSection(),
    renderWizardSection(),
    renderInstallSection(),
    renderUpdateSection(),
  ].join("");

export const renderPublicSettingsTop = (): string =>
  renderResetSection() + renderPublicAppearance() + renderPublicSearchOptions();

async function getNewestRelease(): Promise<string> {
  const tags = await fetch("https://api.github.com/repos/degoog-org/degoog/tags");
  if (tags) {
    const json = await tags.json();
    const value = json?.[0]?.name;
    if (value) return value;
  }
  return "Unknown";
}

const PREF_TOGGLES: { id: string; key: string; defaultVal?: boolean; invert?: boolean }[] = [
  { id: "settings-open-new-tab", key: OPEN_IN_NEW_TAB_KEY, defaultVal: false },
  { id: "display-engine-performance", key: DISPLAY_ENGINE_PERFORMANCE, defaultVal: true },
  { id: "display-related-queries", key: DISPLAY_SEARCH_SUGGESTIONS, defaultVal: true },
  { id: "settings-inline-gif-playback", key: INLINE_GIF_PLAYBACK, defaultVal: false, invert: true },
  { id: "settings-post-method-enabled", key: POST_METHOD_ENABLED, defaultVal: false },
  { id: "settings-sticky-sidebar", key: STICKY_SIDEBAR, defaultVal: false },
  { id: "settings-centered-mode", key: CENTERED_MODE, defaultVal: false },
];

export async function initAppearanceSettings(): Promise<void> {
  const themeSelect = document.getElementById("theme-select") as HTMLSelectElement | null;

  if (themeSelect) {
    const saved = await idbGet<string>(THEME_KEY);
    themeSelect.value = saved || "system";
    themeSelect.addEventListener("change", async () => {
      const value = themeSelect.value;
      await idbSet(THEME_KEY, value);
      try {
        localStorage.setItem(THEME_KEY, value);
      } catch (err) {
        console.debug("[settings] theme localStorage sync failed", err);
      }
      applyTheme(value);
    });
  }

  for (const pref of PREF_TOGGLES) {
    const el = document.getElementById(pref.id) as HTMLInputElement | null;
    if (!el) continue;
    const saved = await idbGet<boolean>(pref.key);
    const raw = saved ?? pref.defaultVal ?? false;
    el.checked = pref.invert ? !raw : raw;
    el.addEventListener("change", async () => {
      await idbSet(pref.key, pref.invert ? !el.checked : el.checked);
    });
  }
}

export const bindResetDefaults = (
  keys: readonly string[],
  rerender: () => Promise<void>,
): void => {
  const resetBtn = document.getElementById("settings-sync-reset-defaults") as HTMLButtonElement | null;
  resetBtn?.addEventListener("click", async () => {
    const confirmed = await confirmModal({
      title: t("settings-page.sync.reset-button"),
      message: t("settings-page.sync.reset-confirm"),
    });
    if (!confirmed) return;
    await resetDefaults(keys);
    applyTheme((await idbGet<string>(THEME_KEY)) || "system");
    await rerender();
  });
};

export async function initPublicGeneral(): Promise<void> {
  const host = document.getElementById("public-settings-content");
  if (host) host.innerHTML = renderPublicSettingsTop();
  await initAppearanceSettings();
}

async function initSyncSetting(): Promise<void> {
  const btn = document.getElementById("settings-sync-save-defaults") as HTMLButtonElement | null;
  if (btn) {
    const label = btn.textContent;
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const ok = await saveDefaults();
      btn.textContent = ok
        ? t("settings-page.sync.saved")
        : t("settings-page.server.save-failed-network");
      setTimeout(() => {
        btn.textContent = label;
        btn.disabled = false;
      }, 1200);
    });
  }

  bindResetDefaults(SYNC_KEYS, initGeneralTab);
}

async function initVersionChecker(): Promise<void> {
  const newestVersionEl = document.getElementById("settings-update-check-newestversion");
  const lastCheckedEl = document.getElementById("settings-update-check-lastchecked");
  const checkNowBtn = document.getElementById("settings-update-check-check") as HTMLButtonElement | null;
  const newAvailableEl = document.getElementById("settings-update-check-newversionavailable");

  let latestDate = new Date(0);
  const latest = localStorage.getItem("last-update-check");
  if (latest) latestDate = new Date(latest);
  const now = new Date();

  if (+now - +latestDate > 24 * 60 * 60 * 1000) {
    latestDate = new Date();
    localStorage.setItem("last-update-check", latestDate.toUTCString());
    const newCheck = await getNewestRelease();
    if (newestVersionEl) newestVersionEl.textContent = newCheck;
    localStorage.setItem("last-update-check-version", newCheck);
  }

  if (lastCheckedEl) lastCheckedEl.textContent = latestDate.toLocaleDateString();
  const currentVersion = localStorage.getItem("last-update-check-version");
  if (pkg.version !== currentVersion && newAvailableEl) newAvailableEl.removeAttribute("style");

  const latestVersion = localStorage.getItem("last-update-check-version");
  if (latestVersion && newestVersionEl) newestVersionEl.textContent = latestVersion;

  checkNowBtn?.addEventListener("click", async () => {
    const newest = await getNewestRelease();
    if (newestVersionEl) newestVersionEl.textContent = newest;
    localStorage.setItem("last-update-check-version", newest);
    const newLatest = new Date();
    localStorage.setItem("last-update-check", newLatest.toUTCString());
    if (lastCheckedEl) lastCheckedEl.textContent = newLatest.toLocaleDateString();
    if (pkg.version !== newest && newAvailableEl && newest != "Unknown")
      newAvailableEl.removeAttribute("style");
    else
      newAvailableEl?.setAttribute("style","display:none");
  });
}

export async function initGeneralTab(): Promise<void> {
  const container = document.getElementById("general-content");
  if (container) container.innerHTML = renderGeneralContent();

  await initAppearanceSettings();
  await initSyncSetting();
  await initVersionChecker();

  document
    .getElementById("settings-wizard-restart")
    ?.addEventListener("click", () => restartWizard());

  document
    .getElementById("settings-install-prompt")
    ?.addEventListener("click", () => requestInstallPrompt());
}
