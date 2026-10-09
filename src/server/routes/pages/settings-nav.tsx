import { renderHtml } from "../../../shared/ui/tribute/html";
import { SETTINGS_NAV, type SettingsNavItem } from "../../../shared/settings-tabs";
import { SettingsNavButton } from "./settings-nav-button";
import { SettingsNavOption } from "./settings-nav-option";

export const buildSettingsNav = (
  items: readonly SettingsNavItem[] = SETTINGS_NAV,
): string =>
  items
    .map((item) => renderHtml(<SettingsNavButton item={item} />))
    .join("\n            ");

export const buildSettingsTabSelect = (
  items: readonly SettingsNavItem[] = SETTINGS_NAV,
): string =>
  items
    .filter((item) => !item.hiddenUntilEnabled)
    .map((item) => renderHtml(<SettingsNavOption item={item} />))
    .join("\n              ");
