import { Button } from "../../../../../shared/ui/components/primitives/button";
import { SettingGroup } from "../../../shared/rows/setting-group";
import { SettingNum } from "../../../shared/rows/setting-num";
import { SettingRow } from "../../../shared/rows/setting-row";
import { SettingStackRow } from "../../../shared/rows/setting-stack-row";
import { SettingSwitchRow } from "../../../shared/rows/setting-switch-row";
import { PROXY_LIST_ID } from "../../proxies/proxy-state";
import { ServerSection } from "../server-section";

const t = window.scopedT("core");

export const ProxySection = (): JSX.Element => (
  <ServerSection
    id="settings-section-proxy"
    heading="settings-page.server.proxy-heading"
    icon="fa-solid fa-network-wired"
    desc="settings-page.server.proxy-desc"
  >
    <SettingGroup>
      <SettingSwitchRow id="settings-proxy-enabled" label={t("settings-page.server.proxy-enable")} main={true} />
      <SettingStackRow
        label={t("settings-page.server.proxy-urls-label")}
        desc={<span id="settings-proxy-count"></span>}
        dep="settings-proxy-enabled"
      >
        <div id={PROXY_LIST_ID} class="settings-proxy-list"></div>
        <div class="settings-preset-actions">
          <Button variant="secondary" id="settings-proxy-test">
            {t("settings-page.server.proxy-test")}
          </Button>
        </div>
        <div class="proxy-test-result" id="settings-proxy-test-result" hidden={true}></div>
      </SettingStackRow>
    </SettingGroup>
    <SettingGroup>
      <SettingRow
        label={t("settings-page.server.proxy-cooldown-minutes-label")}
        desc={t("settings-page.server.proxy-cooldown-minutes-desc")}
        forId="settings-proxy-cooldown-minutes"
        dep="settings-proxy-enabled"
      >
        <SettingNum
          id="settings-proxy-cooldown-minutes"
          saveKey="proxyCooldownMinutes"
          min={0}
          max={1440}
          placeholder="10"
          unit={t("settings-page.server.unit-minutes")}
        />
      </SettingRow>
      <SettingStackRow
        label={t("settings-page.server.proxy-cooldown-triggers-label")}
        desc={t("settings-page.server.proxy-cooldown-triggers-desc")}
        forId="settings-proxy-cooldown-triggers"
        dep="settings-proxy-enabled"
      >
        <textarea
          id="settings-proxy-cooldown-triggers"
          data-save-key="proxyCooldownTriggers"
          class="degoog-input settings-textarea settings-textarea--mono"
          rows={4}
          spellcheck="false"
          placeholder={"rate_limited\ncaptcha\nblocked\nconnect"}
        ></textarea>
      </SettingStackRow>
      <SettingStackRow
        label={t("settings-page.server.proxy-host-groups-label")}
        desc={t("settings-page.server.proxy-host-groups-desc")}
        forId="settings-proxy-host-groups"
        dep="settings-proxy-enabled"
      >
        <textarea
          id="settings-proxy-host-groups"
          data-save-key="proxyHostGroups"
          class="degoog-input settings-textarea settings-textarea--mono"
          rows={3}
          spellcheck="false"
          placeholder="example.com example.co.uk"
        ></textarea>
      </SettingStackRow>
    </SettingGroup>
  </ServerSection>
);
