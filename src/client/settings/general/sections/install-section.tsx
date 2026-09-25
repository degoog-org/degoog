import { Button } from "../../../../shared/ui/components/primitives/button";
import { SettingsSection } from "../../shared/settings-section";
import { requestInstallPrompt } from "../../../utils/app/install-prompt";

const t = window.scopedT("core");

export const InstallSection = (): JSX.Element => (
  <SettingsSection
    icon="fa-solid fa-download"
    headingKey="settings-page.install.heading"
    descKey="settings-page.install.desc"
    noFieldset={true}
  >
    <Button
      variant="secondary"
      class="settings-install-prompt"
      id="settings-install-prompt"
      onClick={() => requestInstallPrompt()}
    >
      {t("settings-page.install.prompt-button")}
    </Button>
  </SettingsSection>
);
