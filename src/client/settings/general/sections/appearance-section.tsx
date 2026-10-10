import { EngineOriginSelect } from "../fields/engine-origin-select";
import { PrefChecks } from "../fields/pref-checks";
import { ThemeSelect } from "../fields/theme-select";
import { GeneralCard } from "../general-card";
import { APPEARANCE_CHECKS } from "../toggles";

export const AppearanceSection = (): JSX.Element => (
  <GeneralCard icon="fa-solid fa-palette" headingKey="settings-page.appearance.heading">
    <ThemeSelect />
    <EngineOriginSelect />
    <PrefChecks checks={APPEARANCE_CHECKS} />
  </GeneralCard>
);
