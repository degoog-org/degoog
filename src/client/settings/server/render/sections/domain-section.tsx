import { SettingGroup } from "../../../shared/rows/setting-group";
import { SettingStackRow } from "../../../shared/rows/setting-stack-row";
import { SettingSwitchRow } from "../../../shared/rows/setting-switch-row";
import { ServerSection } from "../server-section";

const t = window.scopedT("core");

export const DomainSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-domain-management"
    heading="settings-page.server.domain-management-heading"
    icon="fa-solid fa-globe"
    desc="settings-page.server.domain-management-desc"
  >
    <SettingGroup>
      <SettingSwitchRow
        id="settings-domain-block-enabled"
        label={t("settings-page.server.domain-block-enable")}
        desc={t("settings-page.server.domain-block-desc")}
        main={true}
      />
      <SettingStackRow
        label={t("settings-page.server.domain-block-list-label")}
        desc={
          <>
            {`${t("settings-page.server.domain-block-list-desc")} `}
            <span class="settings-hint" tabindex="0" data-tooltip={t("settings-page.server.domain-block-regex-help")} data-tooltip-start={true}>
              {t("settings-page.server.domain-block-regex-example")}
            </span>
          </>
        }
        forId="settings-domain-block-list"
        dep="settings-domain-block-enabled"
      >
        <textarea
          id="settings-domain-block-list"
          data-save-key="domainBlockList"
          class="degoog-input settings-textarea settings-textarea--mono"
          rows={8}
          spellcheck="false"
          placeholder={"quora.com\ntiktok.com\n/(^|\\.)spam\\.net$/"}
        ></textarea>
        <span class="settings-list-count" id="settings-domain-block-count"></span>
      </SettingStackRow>
      <SettingSwitchRow
        id="settings-domain-block-ui-enabled"
        label={t("settings-page.server.domain-block-ui-enable")}
        desc={t("settings-page.server.domain-block-ui-desc")}
        dep="settings-domain-block-enabled"
      />
    </SettingGroup>
    <SettingGroup>
      <SettingSwitchRow
        id="settings-domain-replace-enabled"
        label={t("settings-page.server.domain-replace-enable")}
        desc={t("settings-page.server.domain-replace-desc")}
        main={true}
      />
      <SettingStackRow dep="settings-domain-replace-enabled">
        <div id="settings-domain-replace-editor" class="settings-redirect-editor"></div>
      </SettingStackRow>
      <SettingSwitchRow
        id="settings-domain-replace-ui-enabled"
        label={t("settings-page.server.domain-replace-ui-enable")}
        desc={t("settings-page.server.domain-replace-ui-desc")}
        dep="settings-domain-replace-enabled"
      />
    </SettingGroup>
    <SettingGroup>
      <SettingSwitchRow
        id="settings-domain-score-enabled"
        label={t("settings-page.server.domain-score-enable")}
        desc={t("settings-page.server.domain-score-desc")}
        main={true}
      />
      <SettingStackRow
        label={t("settings-page.server.domain-score-list-label")}
        desc={t("settings-page.server.domain-score-list-desc")}
        dep="settings-domain-score-enabled"
      >
        <div id="settings-domain-score-rows" class="settings-score-rows"></div>
        <div class="settings-list-actions">
          <button type="button" id="settings-domain-score-add" class="settings-score-add">
            {t("settings-page.server.domain-score-add-row")}
          </button>
        </div>
      </SettingStackRow>
      <SettingSwitchRow
        id="settings-domain-score-ui-enabled"
        label={t("settings-page.server.domain-score-ui-enable")}
        desc={t("settings-page.server.domain-score-ui-desc")}
        dep="settings-domain-score-enabled"
      />
    </SettingGroup>
  </ServerSection>
);
