import type { SettingsNavItem } from "../../../shared/settings-tabs";

export const SettingsNavOption = ({ item }: { item: SettingsNavItem }): JSX.Element => (
  <option value={item.id}>{`{{t:settings-page.nav.${item.id}}}`}</option>
);
