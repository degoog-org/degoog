import { SETTINGS_NAV, SettingsNavItem } from "../../../shared/settings-tabs";

const navLabel = (id: string): string => `{{t:settings-page.nav.${id}}}`;

const navButton = (item: SettingsNavItem): string => {
  const active = item.id === "general" ? " active" : "";
  const dynamic = item.hiddenUntilEnabled
    ? ` data-${item.id}-nav style="display: none"`
    : "";
  return `<button class="settings-nav-item${active}" data-tab="${item.id}" type="button"${dynamic}>
              <i class="fa-solid ${item.icon} fa-lg"></i>
              ${navLabel(item.id)}
            </button>`;
};

const navOption = (item: SettingsNavItem): string =>
  `<option value="${item.id}">${navLabel(item.id)}</option>`;

export const buildSettingsNav = (): string =>
  SETTINGS_NAV.map(navButton).join("\n            ");

export const buildSettingsTabSelect = (): string =>
  SETTINGS_NAV.filter((item) => !item.hiddenUntilEnabled)
    .map(navOption)
    .join("\n              ");
