import { SettingGroup } from "../../../shared/rows/setting-group";
import { SettingStackRow } from "../../../shared/rows/setting-stack-row";
import { ServerSection } from "../server-section";

const t = window.scopedT("core");

export const CustomCssSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-custom-css"
    heading="settings-page.server.custom-css-heading"
    icon="fa-solid fa-code"
    desc="settings-page.server.custom-css-desc"
  >
    <SettingGroup>
      <SettingStackRow>
        <textarea
          id="settings-custom-css"
          data-save-key="customCss"
          class="degoog-input settings-textarea settings-textarea--mono"
          rows={8}
          spellcheck="false"
          aria-label={t("settings-page.server.custom-css-label")}
          placeholder={".result-title {\n  color: hotpink !important;\n}"}
        ></textarea>
      </SettingStackRow>
    </SettingGroup>
  </ServerSection>
);
