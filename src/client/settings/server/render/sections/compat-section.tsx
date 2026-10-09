import { SettingGroup } from "../../../shared/rows/setting-group";
import { SettingSwitchRow } from "../../../shared/rows/setting-switch-row";
import { ServerSection } from "../server-section";

const t = window.scopedT("core");

export const CompatSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-searx"
    heading="settings-page.server.compat-heading"
    icon="fa-solid fa-flask"
    desc="settings-page.server.compat-desc"
    badge="settings-page.extensions.compat-experimental"
  >
    <SettingGroup>
      <SettingSwitchRow
        id="settings-searx-compat-enabled"
        label={t("settings-page.server.searx-enable")}
        desc={t("settings-page.server.searx-enable-desc")}
      />
      <SettingSwitchRow
        id="settings-searx-api-enabled"
        label={t("settings-page.server.searx-api-enable")}
        desc={t("settings-page.server.searx-api-enable-desc")}
      />
      <SettingSwitchRow
        id="settings-fourget-compat-enabled"
        label={t("settings-page.server.4get-enable")}
        desc={t("settings-page.server.4get-enable-desc")}
      />
    </SettingGroup>
  </ServerSection>
);
