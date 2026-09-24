import { AppearanceSection } from "./sections/appearance-section";
import { InstallSection } from "./sections/install-section";
import { SearchOptionsSection } from "./sections/search-options-section";
import { SyncSection } from "./sections/sync-section";
import { UpdateSection } from "./sections/update-section";
import { WizardSection } from "./sections/wizard-section";

export const GeneralContent = (): JSX.Element => (
  <>
    <AppearanceSection icon="fa-solid fa-palette" />
    <SearchOptionsSection icon="fa-solid fa-magnifying-glass" />
    <SyncSection />
    <WizardSection />
    <InstallSection />
    <UpdateSection />
  </>
);
