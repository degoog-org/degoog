import { Button } from "../../../../shared/ui/components/primitives/button";
import { SettingRow } from "../../shared/rows/setting-row";
import { ResetDefaultsButton } from "../fields/reset-defaults-button";
import { GeneralCard } from "../general-card";

const t = window.scopedT("core");

export const SyncSection = (): JSX.Element => (
  <GeneralCard icon="fa-solid fa-rotate" headingKey="settings-page.sync.heading">
    <SettingRow label={t("settings-page.sync.label")} desc={t("settings-page.sync.desc")}>
      <Button variant="secondary" id="settings-sync-save-defaults">
        {t("settings-page.sync.save-button")}
      </Button>
      <ResetDefaultsButton />
    </SettingRow>
  </GeneralCard>
);
