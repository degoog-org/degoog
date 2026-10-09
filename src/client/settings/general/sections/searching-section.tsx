import { PrefChecks } from "../fields/pref-checks";
import { GeneralCard } from "../general-card";
import { REGION_HOST_ID, SEARCHING_CHECKS } from "../toggles";

export const SearchingSection = (): JSX.Element => (
  <GeneralCard icon="fa-solid fa-magnifying-glass" headingKey="settings-page.search-options.searching-heading">
    <div id={REGION_HOST_ID} hidden={true} />
    <PrefChecks checks={SEARCHING_CHECKS} />
  </GeneralCard>
);
