import { Button } from "../../../shared/ui/components/primitives/button";
import { SettingsSection } from "../shared/settings-section";
import { ResetDefaultsButton } from "./reset-defaults-button";

const t = window.scopedT("core");

export const SyncSection = (): JSX.Element => (
  <SettingsSection
    icon="fa-solid fa-rotate"
    headingKey="settings-page.sync.heading"
    descKey="settings-page.sync.desc"
    noFieldset={true}
  >
    <div class="settings-page-actions">
      <Button variant="secondary" id="settings-sync-save-defaults">
        {t("settings-page.sync.save-button")}
      </Button>
      <ResetDefaultsButton />
    </div>
  </SettingsSection>
);
