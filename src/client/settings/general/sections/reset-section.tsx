import { SettingRow } from "../../shared/rows/setting-row";
import { ResetDefaultsButton } from "../fields/reset-defaults-button";
import { GeneralCard } from "../general-card";

const t = window.scopedT("core");

export const ResetSection = (): JSX.Element => (
  <GeneralCard icon="fa-solid fa-rotate" headingKey="settings-page.sync.reset-heading">
    <SettingRow label={t("settings-page.sync.reset-label")} desc={t("settings-page.sync.reset-desc")}>
      <ResetDefaultsButton />
    </SettingRow>
  </GeneralCard>
);
