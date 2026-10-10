import { SettingGroup } from "../../../shared/rows/setting-group";
import { SettingNum } from "../../../shared/rows/setting-num";
import { SettingRow } from "../../../shared/rows/setting-row";
import { SettingSwitchRow } from "../../../shared/rows/setting-switch-row";
import { RateRow } from "../rate-row";
import { ServerSection } from "../server-section";

const t = window.scopedT("core");

export const RateLimitSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-rate-limit"
    heading="settings-page.server.rate-limit-heading"
    icon="fa-solid fa-clock"
    desc="settings-page.server.rate-limit-desc"
  >
    <SettingGroup id="settings-rate-limit-options">
      <SettingSwitchRow
        id="settings-rate-limit-enabled"
        label={t("settings-page.server.rate-limit-enable")}
        desc={t("settings-page.server.rate-limit-defaults")}
        main={true}
      />
      <RateRow
        label={t("settings-page.server.rate-limit-burst")}
        maxId="settings-rate-limit-burst-max"
        windowId="settings-rate-limit-burst-window"
        maxPlaceholder="15"
        windowPlaceholder="20"
        dep="settings-rate-limit-enabled"
      />
      <RateRow
        label={t("settings-page.server.rate-limit-long")}
        maxId="settings-rate-limit-long-max"
        windowId="settings-rate-limit-long-window"
        maxPlaceholder="150"
        windowPlaceholder="600"
        dep="settings-rate-limit-enabled"
      />
    </SettingGroup>
    <SettingGroup id="settings-rate-limit-suggest-options">
      <SettingSwitchRow
        id="settings-rate-limit-suggest-enabled"
        label={t("settings-page.server.rate-limit-suggest-enable")}
        desc={t("settings-page.server.rate-limit-suggest-defaults")}
        main={true}
      />
      <RateRow
        label={t("settings-page.server.rate-limit-burst")}
        maxId="settings-rate-limit-suggest-burst-max"
        windowId="settings-rate-limit-suggest-burst-window"
        maxPlaceholder="60"
        windowPlaceholder="20"
        dep="settings-rate-limit-suggest-enabled"
      />
      <RateRow
        label={t("settings-page.server.rate-limit-long")}
        maxId="settings-rate-limit-suggest-long-max"
        windowId="settings-rate-limit-suggest-long-window"
        maxPlaceholder="120"
        windowPlaceholder="60"
        dep="settings-rate-limit-suggest-enabled"
      />
    </SettingGroup>
    <SettingGroup>
      <SettingRow
        label={t("settings-page.server.ac-debounce")}
        desc={t("settings-page.server.ac-debounce-desc")}
        forId="settings-ac-debounce-ms"
      >
        <SettingNum id="settings-ac-debounce-ms" saveKey="acDebounceMs" min={0} max={2000} placeholder="300" unit="ms" />
      </SettingRow>
      <SettingRow
        label={t("settings-page.server.request-body-max")}
        desc={t("settings-page.server.request-body-max-desc")}
        forId="settings-request-body-max-kb"
      >
        <SettingNum id="settings-request-body-max-kb" saveKey="requestBodyMaxKb" min={0} max={131072} unit="KB" />
      </SettingRow>
    </SettingGroup>
  </ServerSection>
);
