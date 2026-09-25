import { SettingsSection } from "../../shared/settings-section";
import { SearchOptionFields } from "../fields/search-option-fields";

export const SearchOptionsSection = ({ icon }: { icon?: string }): JSX.Element => (
  <SettingsSection
    icon={icon}
    headingKey="settings-page.search-options.heading"
    fieldsetClass="settings-toggle-grid"
  >
    <SearchOptionFields />
  </SettingsSection>
);
