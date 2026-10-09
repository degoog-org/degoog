import { Button } from "../../../../../shared/ui/components/primitives/button";
import { SettingGroup } from "../../../shared/rows/setting-group";
import { SettingRow } from "../../../shared/rows/setting-row";
import { ServerSection } from "../server-section";

const t = window.scopedT("core");

export const RestartSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-restart"
    heading="settings-page.server.restart-heading"
    icon="fa-solid fa-power-off"
    desc="settings-page.server.restart-desc"
  >
    <SettingGroup>
      <div class="settings-server-restart-pending" id="settings-server-restart-pending" hidden={true}>
        <p class="store-restart-intro">{t("settings-page.restart.modal-intro")}</p>
        <ul class="store-restart-list" id="settings-server-restart-reasons"></ul>
      </div>
      <SettingRow label={t("settings-page.server.restart-now")} desc={t("settings-page.server.restart-now-desc")}>
        <Button variant="secondary" id="settings-server-restart">
          {t("settings-page.server.restart-button")}
        </Button>
      </SettingRow>
    </SettingGroup>
  </ServerSection>
);
