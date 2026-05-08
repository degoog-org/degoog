import { getBase } from "./base-url";

const SETTINGS_RETURN_KEY = "degoog-settings-return";

export function recordSettingsReturn(): void {
  if (window.location.pathname !== "/search") return;
  sessionStorage.setItem(
    SETTINGS_RETURN_KEY,
    `${window.location.pathname}${window.location.search}`,
  );
}

export function clearSettingsReturn(): void {
  sessionStorage.removeItem(SETTINGS_RETURN_KEY);
}

export function navigateSettingsBack(): void {
  const raw = sessionStorage.getItem(SETTINGS_RETURN_KEY);
  sessionStorage.removeItem(SETTINGS_RETURN_KEY);
  if (!raw) {
    window.location.href = `${getBase()}/`;
    return;
  }
  try {
    const parsed = new URL(raw, window.location.origin);
    if (
      parsed.origin !== window.location.origin ||
      parsed.pathname !== "/search"
    ) {
      window.location.href = `${getBase()}/`;
      return;
    }
    if (!parsed.search && !parsed.hash) {
      window.history.back();
      return;
    }
    window.location.href = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    window.location.href = `${getBase()}/`;
  }
}

export function showHome(): void {
  clearSettingsReturn();
  window.location.href = `${getBase()}/`;
}

export function setActiveTab(type: string): void {
  document.querySelectorAll<HTMLElement>(".results-tab").forEach((tab) => {
    const tabType = tab.dataset.type ?? "";
    const match = tabType === type || tabType === `tab:engine:${type}`;
    tab.classList.toggle("active", match);
  });
}

function _updateTabVisibility(tab: HTMLElement): void {
  const hidden =
    tab.dataset.bangHidden === "true" || tab.dataset.typeDisabled === "true";
  tab.style.display = hidden ? "none" : "";
}

export function setTabsForBang(matchType: string | null): void {
  document.querySelectorAll<HTMLElement>(".results-tab").forEach((tab) => {
    const tabType = tab.dataset.type ?? "";
    const visible =
      matchType !== null &&
      (tabType === matchType || tabType === `tab:engine:${matchType}`);
    tab.dataset.bangHidden = visible ? "" : "true";
    _updateTabVisibility(tab);
  });
}

export function showAllTabs(): void {
  document.querySelectorAll<HTMLElement>(".results-tab").forEach((tab) => {
    delete tab.dataset.bangHidden;
    _updateTabVisibility(tab);
  });
}

export function setTabTypeDisabled(type: string, disabled: boolean): void {
  document.querySelectorAll<HTMLElement>(".results-tab").forEach((tab) => {
    const tabType = tab.dataset.type ?? "";
    if (tabType === type || tabType === `tab:engine:${type}`) {
      tab.dataset.typeDisabled = disabled ? "true" : "";
      _updateTabVisibility(tab);
    }
  });
}
