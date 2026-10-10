import { SettingGroup } from "../../../shared/rows/setting-group";
import { SettingSwitchRow } from "../../../shared/rows/setting-switch-row";
import { ServerSection } from "../server-section";

const t = window.scopedT("core");

export const IndexerSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-indexer"
    heading="settings-page.server.indexer-heading"
    icon="fa-solid fa-database"
    desc="settings-page.server.indexer-desc"
  >
    <SettingGroup>
      <SettingSwitchRow
        id="settings-degoog-indexer-enabled"
        label={t("settings-page.server.indexer-enable")}
        desc={t("settings-page.server.indexer-enable-desc")}
        main={true}
      />
    </SettingGroup>
  </ServerSection>
);
