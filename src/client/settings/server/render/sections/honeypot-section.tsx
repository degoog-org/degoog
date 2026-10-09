import { Button } from "../../../../../shared/ui/components/primitives/button";
import { SettingGroup } from "../../../shared/rows/setting-group";
import { SettingNum } from "../../../shared/rows/setting-num";
import { SettingRow } from "../../../shared/rows/setting-row";
import { SettingStackRow } from "../../../shared/rows/setting-stack-row";
import { SettingSwitchRow } from "../../../shared/rows/setting-switch-row";
import { ServerSection } from "../server-section";

const t = window.scopedT("core");

export const HoneypotSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-honeypot"
    heading="settings-page.server.honeypot-heading"
    icon="fa-solid fa-spider"
    desc="settings-page.server.honeypot-desc"
  >
    <SettingGroup>
      <SettingSwitchRow
        id="settings-honeypot-enabled"
        label={t("settings-page.server.honeypot-enable")}
        desc={t("settings-page.server.honeypot-enable-desc")}
        main={true}
      />
      <SettingSwitchRow
        id="settings-honeypot-css-check"
        label={t("settings-page.server.honeypot-css-check-enable")}
        desc={t("settings-page.server.honeypot-css-check-desc")}
        main={true}
        checked={true}
      />
      <SettingRow
        label={t("settings-page.server.honeypot-ban-duration-label")}
        desc={t("settings-page.server.honeypot-ban-duration-desc")}
        forId="settings-honeypot-ban-duration"
      >
        <SettingNum
          id="settings-honeypot-ban-duration"
          saveKey="honeypotBanDuration"
          min={0}
          placeholder="72"
          unit={t("settings-page.server.unit-hours")}
        />
      </SettingRow>
    </SettingGroup>
    <SettingGroup>
      <SettingStackRow
        label={t("settings-page.server.honeypot-blocklist-label")}
        desc={<span id="settings-honeypot-ban-count"></span>}
        forId="settings-honeypot-ban-ip"
      >
        <div class="settings-ban-add">
          <input
            type="text"
            id="settings-honeypot-ban-ip"
            class="degoog-input"
            placeholder={t("settings-page.server.honeypot-ban-placeholder")}
            spellcheck="false"
            autocomplete="off"
          />
          <Button variant="primary" id="settings-honeypot-ban-add">
            {t("settings-page.server.honeypot-ban-add")}
          </Button>
        </div>
        <div id="settings-honeypot-blocklist-rows" class="settings-ban-list"></div>
      </SettingStackRow>
    </SettingGroup>
  </ServerSection>
);
