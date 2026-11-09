import { Button } from "../../../../../shared/ui/components/primitives/button";
import { SettingGroup } from "../../../shared/rows/setting-group";
import { SettingRow } from "../../../shared/rows/setting-row";
import { SettingSwitchRow } from "../../../shared/rows/setting-switch-row";
import { ServerSection } from "../server-section";

const t = window.scopedT("core");

export const LogosSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-logos"
    heading="settings-page.server.logos-heading"
    icon="fa-solid fa-palette"
    desc="settings-page.server.logos-desc"
  >
    <SettingGroup>
      <SettingSwitchRow
        id="settings-logos-enabled"
        label={t("settings-page.server.logos-enable")}
        main={true}
        checked={true}
      />
      <SettingRow
        label={t("settings-page.server.logos-today-label")}
        desc={<span id="settings-logos-status"></span>}
        dep="settings-logos-enabled"
      >
        <Button variant="secondary" id="settings-logos-refresh">
          {t("settings-page.server.logos-refresh")}
        </Button>
      </SettingRow>
    </SettingGroup>
  </ServerSection>
);
