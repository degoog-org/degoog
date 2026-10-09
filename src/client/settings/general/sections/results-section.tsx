import { PrefChecks } from "../fields/pref-checks";
import { GeneralCard } from "../general-card";
import { RESULT_CHECKS } from "../toggles";

export const ResultsSection = (): JSX.Element => (
  <GeneralCard icon="fa-solid fa-list" headingKey="settings-page.search-options.results-heading">
    <PrefChecks checks={RESULT_CHECKS} />
  </GeneralCard>
);
