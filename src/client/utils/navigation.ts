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
    window.location.href = "/";
    return;
  }
  try {
    const parsed = new URL(raw, window.location.origin);
    if (
      parsed.origin !== window.location.origin ||
      parsed.pathname !== "/search"
    ) {
      window.location.href = "/";
      return;
    }
    window.location.href = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    window.location.href = "/";
  }
}

export function showHome(): void {
  clearSettingsReturn();
  window.location.href = "/";
}

export function setActiveTab(type: string): void {
  document.querySelectorAll<HTMLElement>(".results-tab").forEach((tab) => {
    const tabType = tab.dataset.type ?? "";
    const match = tabType === type || tabType === `tab:engine:${type}`;
    tab.classList.toggle("active", match);
  });
}
