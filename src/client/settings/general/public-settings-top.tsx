import { AppearanceSection } from "./sections/appearance-section";
import { ResetSection } from "./sections/reset-section";
import { SearchOptionsSection } from "./sections/search-options-section";

export const PublicSettingsTop = (): JSX.Element => (
  <>
    <ResetSection />
    <AppearanceSection />
    <SearchOptionsSection />
  </>
);
