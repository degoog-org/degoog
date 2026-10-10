import { AboutSection } from "./sections/about-section";
import { AppearanceSection } from "./sections/appearance-section";
import { ResultsSection } from "./sections/results-section";
import { SearchingSection } from "./sections/searching-section";
import { SyncSection } from "./sections/sync-section";

export const GeneralContent = (): JSX.Element => (
  <>
    <AppearanceSection />
    <ResultsSection />
    <SearchingSection />
    <SyncSection />
    <AboutSection />
  </>
);
