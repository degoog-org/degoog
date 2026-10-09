import { SettingGroup } from "../../../shared/rows/setting-group";
import { SettingSwitchRow } from "../../../shared/rows/setting-switch-row";
import { ServerSection } from "../server-section";

const t = window.scopedT("core");

export const NojsSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-nojs"
    heading="settings-page.server.nojs-heading"
    icon="fa-solid fa-file-code"
    badge="settings-page.extensions.compat-experimental"
    desc="settings-page.server.nojs-desc"
  >
    <SettingGroup>
      <SettingSwitchRow id="settings-nojs-enabled" label={t("settings-page.server.nojs-enable")} main={true} />
      <SettingSwitchRow
        id="settings-nojs-css-check"
        label={t("settings-page.server.nojs-css-check-enable")}
        desc={t("settings-page.server.nojs-css-check-desc")}
        dep="settings-nojs-enabled"
      />
    </SettingGroup>
  </ServerSection>
);
