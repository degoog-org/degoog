import {
  SETTINGS_TABS,
  type SettingsTab,
} from "../../shared/settings-tabs";

export function getSettingsRoot(): string {
  const path = window.location.pathname.replace(/\/$/, "");
  for (const tab of SETTINGS_TABS) {
    if (path.endsWith(`/${tab}`)) {
      return path.slice(0, -(tab.length + 1));
    }
  }
  return path;
}

export function getActiveSettingsTab(): SettingsTab | null {
  const root = getSettingsRoot();
  const path = window.location.pathname.replace(/\/$/, "");
  if (path === root) return "general";
  const prefix = `${root}/`;
  if (!path.startsWith(prefix)) return null;
  const segment = path.slice(prefix.length);
  if (segment.includes("/")) return null;
  if (!(SETTINGS_TABS as readonly string[]).includes(segment)) return null;
  return segment as SettingsTab;
}

export function isSettingsPathname(pathname: string): boolean {
  const normalized = pathname.replace(/\/$/, "");
  if (normalized === "/settings" || normalized.startsWith("/settings/")) {
    return true;
  }
  for (const tab of SETTINGS_TABS) {
    if (normalized.endsWith(`/${tab}`)) return true;
  }
  const root = getSettingsRoot();
  return normalized === root || normalized.startsWith(`${root}/`);
}
