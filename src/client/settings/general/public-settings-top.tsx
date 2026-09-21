import { AppearanceSection } from "./appearance-section";
import { ResetSection } from "./reset-section";
import { SearchOptionsSection } from "./search-options-section";

export const PublicSettingsTop = (): JSX.Element => (
  <>
    <ResetSection />
    <AppearanceSection />
    <SearchOptionsSection />
  </>
);
