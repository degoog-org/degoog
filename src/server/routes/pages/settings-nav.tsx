import { renderHtml } from "../../../shared/ui/core/html";
import { SETTINGS_NAV } from "../../../shared/settings-tabs";
import { SettingsNavButton } from "./settings-nav-button";
import { SettingsNavOption } from "./settings-nav-option";

export const buildSettingsNav = (): string =>
  SETTINGS_NAV.map((item) => renderHtml(<SettingsNavButton item={item} />)).join(
    "\n            ",
  );

export const buildSettingsTabSelect = (): string =>
  SETTINGS_NAV.filter((item) => !item.hiddenUntilEnabled)
    .map((item) => renderHtml(<SettingsNavOption item={item} />))
    .join("\n              ");
