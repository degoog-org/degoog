import { Button } from "../../../../shared/ui/components/primitives/button";
import { SettingGroup } from "../../shared/rows/setting-group";
import { SettingRow } from "../../shared/rows/setting-row";
import { SettingSelect } from "../../shared/rows/setting-select";
import { SettingStackRow } from "../../shared/rows/setting-stack-row";
import { SERVER_SETTINGS_PRESETS } from "../presets";

const t = window.scopedT("core");

export const PresetsBlock = (): JSX.Element => (
  <SettingGroup>
    <SettingRow
      label={t("settings-page.server.presets.select-label")}
      desc={t("settings-page.server.presets.desc")}
      forId="settings-server-preset-select"
    >
      <SettingSelect id="settings-server-preset-select">
        <option value="">{t("settings-page.server.presets.select-placeholder")}</option>
        {SERVER_SETTINGS_PRESETS.map((preset) => (
          <option value={preset.id}>{t(preset.labelKey)}</option>
        ))}
      </SettingSelect>
    </SettingRow>
    <SettingStackRow id="settings-server-preset-preview" class="settings-preset-preview" hidden={true}>
      <p class="settings-row-desc" id="settings-server-preset-description"></p>
      <div id="settings-server-preset-warnings" hidden={true}>
        <span class="settings-row-label">{t("settings-page.server.presets.warnings-heading")}</span>
        <ul class="settings-preset-list settings-preset-list--warn" id="settings-server-preset-warning-list"></ul>
      </div>
      <span class="settings-row-label">{t("settings-page.server.presets.changes-heading")}</span>
      <ul class="settings-preset-list" id="settings-server-preset-change-list"></ul>
      <div class="settings-preset-actions">
        <Button variant="primary" id="settings-server-preset-apply">
          {t("settings-page.server.presets.apply")}
        </Button>
        <span class="settings-row-desc" id="settings-server-preset-status" role="status" aria-live="polite"></span>
      </div>
    </SettingStackRow>
  </SettingGroup>
);
