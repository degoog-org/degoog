import type { SettingsNavItem } from "../../../shared/settings-tabs";

export const SettingsNavButton = ({ item }: { item: SettingsNavItem }): JSX.Element => (
  <button
    class={item.id === "general" ? "settings-nav-item active" : "settings-nav-item"}
    data-tab={item.id}
    type="button"
    {...(item.hiddenUntilEnabled
      ? { [`data-${item.id}-nav`]: true, style: "display: none" }
      : {})}
  >
    <i class={`fa-solid ${item.icon} fa-lg`}></i>
    {` {{t:settings-page.nav.${item.id}}}`}
  </button>
);
