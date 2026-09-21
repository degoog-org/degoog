import pkg from "../../../../package.json";
import { render } from "../../../shared/ui/core/dom";
import { GeneralContent } from "./general-content";
import { PublicSettingsTop } from "./public-settings-top";
import { INSTANCE_DEFAULT_VALUE, PREF_TOGGLES } from "./toggles";
import { ENGINE_ORIGIN_DISPLAY, THEME_KEY } from "../../constants";
import { idbDel, idbGet, idbSet } from "../../utils/db";
import { ENGINE_ORIGIN_DISPLAY_VALUES } from "../../../shared/engine-origins";
import { resetDefaults, saveDefaults } from "../../utils/sync";
import { SYNC_KEYS } from "../../../shared/sync";
import { applyTheme } from "../../utils/theme";
import { confirmModal } from "../../modules/modals/confirm-modal/confirm";
import { isUpdateAvailable } from "../../../shared/utils/version";

const t = window.scopedT("core");

async function getNewestRelease(): Promise<string> {
  const tags = await fetch("https://api.github.com/repos/degoog-org/degoog/tags");
  if (tags) {
    const json = await tags.json();
    const value = json?.[0]?.name;
    if (value) return value;
  }
  return "Unknown";
}

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

  const originSelect = document.getElementById("engine-origin-select") as HTMLSelectElement | null;

  if (originSelect) {
    const saved = await idbGet<string>(ENGINE_ORIGIN_DISPLAY);
    originSelect.value =
      saved && ENGINE_ORIGIN_DISPLAY_VALUES.includes(saved)
        ? saved
        : INSTANCE_DEFAULT_VALUE;
    originSelect.addEventListener("change", async () => {
      const value = originSelect.value;
      if (value === INSTANCE_DEFAULT_VALUE) await idbDel(ENGINE_ORIGIN_DISPLAY);
      else await idbSet(ENGINE_ORIGIN_DISPLAY, value);
      window.dispatchEvent(new Event("extensions-saved"));
    });
  }

  for (const pref of PREF_TOGGLES) {
    const el = document.getElementById(pref.id) as HTMLInputElement | null;
    if (!el) continue;
    const saved = await idbGet<boolean>(pref.key);
    const stored = saved ?? pref.defaultVal ?? false;
    el.checked = pref.invert ? !stored : stored;
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
  if (host) render(<PublicSettingsTop />, host);
  await initAppearanceSettings();
}

async function initSyncSetting(getToken: () => string | null): Promise<void> {
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

  bindResetDefaults(SYNC_KEYS, () => initGeneralTab(getToken));
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
  if (currentVersion && isUpdateAvailable(pkg.version, currentVersion) && newAvailableEl)
    newAvailableEl.removeAttribute("style");

  const latestVersion = localStorage.getItem("last-update-check-version");
  if (latestVersion && newestVersionEl) newestVersionEl.textContent = latestVersion;

  checkNowBtn?.addEventListener("click", async () => {
    const newest = await getNewestRelease();
    if (newestVersionEl) newestVersionEl.textContent = newest;
    localStorage.setItem("last-update-check-version", newest);
    const newLatest = new Date();
    localStorage.setItem("last-update-check", newLatest.toUTCString());
    if (lastCheckedEl) lastCheckedEl.textContent = newLatest.toLocaleDateString();
    if (newest != "Unknown" && isUpdateAvailable(pkg.version, newest) && newAvailableEl)
      newAvailableEl.removeAttribute("style");
    else
      newAvailableEl?.setAttribute("style","display:none");
  });
}

export async function initGeneralTab(
  getToken: () => string | null,
): Promise<void> {
  const container = document.getElementById("general-content");
  if (container) render(<GeneralContent />, container);

  await initAppearanceSettings();
  await initSyncSetting(getToken);
  await initVersionChecker();
}
