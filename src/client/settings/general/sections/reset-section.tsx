import { SettingsSection } from "../../shared/settings-section";
import { ResetDefaultsButton } from "../fields/reset-defaults-button";

export const ResetSection = (): JSX.Element => (
  <SettingsSection
    icon="fa-solid fa-rotate"
    headingKey="settings-page.sync.reset-heading"
    descKey="settings-page.sync.reset-desc"
    noFieldset={true}
  >
    <ResetDefaultsButton />
  </SettingsSection>
);
