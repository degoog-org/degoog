import { SettingGroup } from "../../../shared/rows/setting-group";
import { SettingStackRow } from "../../../shared/rows/setting-stack-row";
import { SettingSwitchRow } from "../../../shared/rows/setting-switch-row";
import { ServerSection } from "../server-section";

const t = window.scopedT("core");

export const PrivacySection = (): JSX.Element => (
  <ServerSection
    id="settings-section-privacy"
    heading="settings-page.server.privacy-heading"
    icon="fa-solid fa-user-shield"
    desc="settings-page.server.privacy-desc"
  >
    <SettingGroup>
      <SettingSwitchRow
        id="settings-block-client-leaks"
        label={t("settings-page.server.block-client-leaks")}
        desc={t("settings-page.server.block-client-leaks-desc")}
        main={true}
      />
    </SettingGroup>
    <SettingGroup>
      <SettingSwitchRow
        id="settings-image-proxy-allow-local"
        label={t("settings-page.server.image-proxy-allow-local")}
        desc={t("settings-page.server.image-proxy-allow-local-desc")}
        main={true}
      />
      <SettingStackRow
        label={t("settings-page.server.image-proxy-allow-list-label")}
        desc={t("settings-page.server.image-proxy-allow-list-desc")}
        forId="settings-image-proxy-allow-list"
        dep="settings-image-proxy-allow-local"
      >
        <textarea
          id="settings-image-proxy-allow-list"
          data-save-key="imageProxyAllowList"
          class="degoog-input settings-textarea settings-textarea--mono"
          rows={3}
          spellcheck="false"
          placeholder={"^192\\.168\\.\n^10\\.\njellyfin\\.lan"}
        ></textarea>
      </SettingStackRow>
    </SettingGroup>
    <SettingGroup>
      <SettingStackRow
        label={t("settings-page.server.privacy-policy-label")}
        desc={t("settings-page.server.privacy-policy-desc")}
        forId="settings-privacy-policy"
      >
        <textarea
          id="settings-privacy-policy"
          data-save-key="privacyPolicy"
          class="degoog-input settings-textarea"
          rows={6}
          placeholder={t("settings-page.server.privacy-policy-placeholder")}
        ></textarea>
      </SettingStackRow>
    </SettingGroup>
  </ServerSection>
);
