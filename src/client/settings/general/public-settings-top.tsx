import { AppearanceSection } from "./sections/appearance-section";
import { ResetSection } from "./sections/reset-section";
import { ResultsSection } from "./sections/results-section";
import { SearchingSection } from "./sections/searching-section";

export const PublicSettingsTop = (): JSX.Element => (
  <>
    <AppearanceSection />
    <ResultsSection />
    <SearchingSection />
    <ResetSection />
  </>
);
