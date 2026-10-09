import pkg from "../../../../package.json";
import { render } from "../../../shared/ui/tribute/dom";
import { GeneralContent } from "./general-content";
import { WIZARD_SECTION_ID } from "./sections/wizard-section";
import { fetchWizardDisabled } from "../../modules/wizard/server";
import { PublicSettingsTop } from "./public-settings-top";
import { mountRegionSelect } from "./region-settings";
import { FOLLOW_INSTANCE_ORIGIN, INSTANCE_DEFAULT_VALUE, PREF_TOGGLES } from "./toggles";
import { ENGINE_ORIGIN_DISPLAY, REGION_KEY, THEME_KEY } from "../../constants";
import { idbGet, idbSet } from "../../utils/storage/db";
import { ENGINE_ORIGIN_DISPLAY_VALUES } from "../../../shared/engine-origins";
import { resetDefaults, saveDefaults } from "../../utils/storage/sync";
import { SYNC_KEYS } from "../../../shared/sync";
import { applyTheme } from "../../utils/app/theme";
import { confirmModal } from "../../modules/modals/confirm-modal/confirm";
import { isUpdateAvailable } from "../../../shared/utils/version";
import { getBase } from "../../utils/net/base-url";
import { jsonHeaders } from "../../utils/net/request";
import { getStoredToken } from "../../utils/settings/settings-token";

const t = window.scopedT("core");

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const UNKNOWN_VERSION = "Unknown";

const _bound = new WeakSet<HTMLElement>();

const _bindOnce = (
  el: HTMLElement | null,
  type: string,
  handler: () => void | Promise<void>,
): void => {
  if (!el || _bound.has(el)) return;
  _bound.add(el);
  el.addEventListener(type, () => void handler());
};

async function getNewestRelease(fresh = false): Promise<string> {
  try {
    const res = await fetch(`${getBase()}/api/settings/update-check${fresh ? "?fresh=1" : ""}`, {
      headers: jsonHeaders(getStoredToken),
    });
    if (res.ok) {
      const { newest } = (await res.json()) as { newest?: string };
      if (newest) return newest;
    }
  } catch (err) {
    console.debug("[settings] update check failed", err);
  }
  return UNKNOWN_VERSION;
}

const _versionLabel = (version: string): string =>
  version === UNKNOWN_VERSION ? t("settings-page.update-check.unknown") : version;

export async function initAppearanceSettings(): Promise<void> {
  const themeSelect = document.getElementById(
    "theme-select",
  ) as HTMLSelectElement | null;

  if (themeSelect) {
    const saved = await idbGet<string>(THEME_KEY);
    themeSelect.value = saved || "system";
    _bindOnce(themeSelect, "change", async () => {
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

  const originSelect = document.getElementById(
    "engine-origin-select",
  ) as HTMLSelectElement | null;

  if (originSelect) {
    const saved = await idbGet<string>(ENGINE_ORIGIN_DISPLAY);
    originSelect.value =
      saved && ENGINE_ORIGIN_DISPLAY_VALUES.includes(saved)
        ? saved
        : INSTANCE_DEFAULT_VALUE;
    _bindOnce(originSelect, "change", async () => {
      const value = originSelect.value;
      await idbSet(
        ENGINE_ORIGIN_DISPLAY,
        value === INSTANCE_DEFAULT_VALUE ? FOLLOW_INSTANCE_ORIGIN : value,
      );
      window.dispatchEvent(new Event("extensions-saved"));
    });
  }

  const regionSelect = await mountRegionSelect();
  if (regionSelect) {
    _bindOnce(regionSelect, "change", async () => {
      await idbSet(REGION_KEY, regionSelect.value);
    });
  }

  for (const pref of PREF_TOGGLES) {
    const el = document.getElementById(pref.id) as HTMLInputElement | null;
    if (!el) continue;
    const saved = await idbGet<boolean>(pref.key);
    const stored = saved ?? pref.defaultVal ?? false;
    el.checked = pref.invert ? !stored : stored;
    _bindOnce(el, "change", async () => {
      await idbSet(pref.key, pref.invert ? !el.checked : el.checked);
    });
  }
}

export const bindResetDefaults = (
  keys: readonly string[],
  rerender: () => Promise<void>,
): void => {
  const resetBtn = document.getElementById(
    "settings-sync-reset-defaults",
  ) as HTMLButtonElement | null;
  _bindOnce(resetBtn, "click", async () => {
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
  const btn = document.getElementById(
    "settings-sync-save-defaults",
  ) as HTMLButtonElement | null;
  if (btn) {
    const label = btn.textContent;
    _bindOnce(btn, "click", async () => {
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
  const newestVersionEl = document.getElementById(
    "settings-update-check-newestversion",
  );
  const lastCheckedEl = document.getElementById(
    "settings-update-check-lastchecked",
  );
  const checkNowBtn = document.getElementById(
    "settings-update-check-check",
  ) as HTMLButtonElement | null;
  const newAvailableEl = document.getElementById(
    "settings-update-check-newversionavailable",
  );

  let latestDate = new Date(0);
  const latest = localStorage.getItem("last-update-check");
  if (latest) latestDate = new Date(latest);
  const now = new Date();

  if (+now - +latestDate > UPDATE_CHECK_INTERVAL_MS) {
    latestDate = new Date();
    localStorage.setItem("last-update-check", latestDate.toUTCString());
    const newCheck = await getNewestRelease();
    if (newestVersionEl) newestVersionEl.textContent = _versionLabel(newCheck);
    localStorage.setItem("last-update-check-version", newCheck);
  }

  if (lastCheckedEl)
    lastCheckedEl.textContent = latestDate.toLocaleDateString();
  const currentVersion = localStorage.getItem("last-update-check-version");
  if (
    currentVersion &&
    isUpdateAvailable(pkg.version, currentVersion) &&
    newAvailableEl
  )
    newAvailableEl.removeAttribute("style");

  const latestVersion = localStorage.getItem("last-update-check-version");
  if (latestVersion && newestVersionEl)
    newestVersionEl.textContent = _versionLabel(latestVersion);

  _bindOnce(checkNowBtn, "click", async () => {
    const newest = await getNewestRelease(true);
    if (newestVersionEl) newestVersionEl.textContent = _versionLabel(newest);
    localStorage.setItem("last-update-check-version", newest);
    const newLatest = new Date();
    localStorage.setItem("last-update-check", newLatest.toUTCString());
    if (lastCheckedEl)
      lastCheckedEl.textContent = newLatest.toLocaleDateString();
    if (
      newest != UNKNOWN_VERSION &&
      isUpdateAvailable(pkg.version, newest) &&
      newAvailableEl
    )
      newAvailableEl.removeAttribute("style");
    else newAvailableEl?.setAttribute("style", "display:none");
  });
}

export async function initGeneralTab(
  getToken: () => string | null,
): Promise<void> {
  const container = document.getElementById("general-content");
  if (container) render(<GeneralContent />, container);
  if (await fetchWizardDisabled()) document.getElementById(WIZARD_SECTION_ID)?.remove();

  await initAppearanceSettings();
  await initSyncSetting(getToken);
  await initVersionChecker();
}
