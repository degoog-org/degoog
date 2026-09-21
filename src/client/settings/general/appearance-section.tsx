import { SettingsSection } from "../shared/settings-section";
import { ThemeSelect } from "./theme-select";

export const AppearanceSection = ({ icon }: { icon?: string }): JSX.Element => (
  <SettingsSection
    icon={icon}
    headingKey="settings-page.appearance.heading"
    descKey="settings-page.appearance.desc"
    fieldsetClass={icon ? "ext-card-main" : undefined}
  >
    <ThemeSelect />
  </SettingsSection>
);
