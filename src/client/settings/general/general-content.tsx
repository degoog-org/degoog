import { AppearanceSection } from "./appearance-section";
import { InstallSection } from "./install-section";
import { SearchOptionsSection } from "./search-options-section";
import { SyncSection } from "./sync-section";
import { UpdateSection } from "./update-section";
import { WizardSection } from "./wizard-section";

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
