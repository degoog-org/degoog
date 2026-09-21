import { Button } from "../../../shared/ui/components/primitives/button";
import { SettingsSection } from "../shared/settings-section";
import { restartWizard } from "../../modules/wizard/wizard";

const t = window.scopedT("core");

export const WizardSection = (): JSX.Element => (
  <SettingsSection
    icon="fa-solid fa-route"
    headingKey="settings-page.wizard.restart-heading"
    descKey="settings-page.wizard.restart-desc"
    noFieldset={true}
  >
    <Button
      variant="secondary"
      id="settings-wizard-restart"
      onClick={() => restartWizard()}
    >
      {t("settings-page.wizard.restart-button")}
    </Button>
  </SettingsSection>
);
