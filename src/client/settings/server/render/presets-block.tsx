import { Button } from "../../../../shared/ui/components/primitives/button";
import { SERVER_SETTINGS_PRESETS } from "../presets";
import { FIELDSET } from "./classes";
import { SectionDesc } from "./section-desc";
import { SubHeading } from "./sub-heading";

const t = window.scopedT("core");

export const PresetsBlock = (): JSX.Element => (
  <div class="settings-server-block">
    <SubHeading k="settings-page.server.config.presets-label" />
    <SectionDesc k="settings-page.server.presets.desc" />
    <div class={FIELDSET}>
      <div class="degoog-select-wrap">
        <select
          id="settings-server-preset-select"
          class="settings-server-preset-select degoog-input"
          aria-label={t("settings-page.server.presets.select-label")}
        >
          <option value="">{t("settings-page.server.presets.select-placeholder")}</option>
          {SERVER_SETTINGS_PRESETS.map((preset) => (
            <option value={preset.id}>{t(preset.labelKey)}</option>
          ))}
        </select>
      </div>
      <div class="settings-server-preset-preview" id="settings-server-preset-preview" hidden={true}>
        <p class="settings-desc" id="settings-server-preset-description"></p>
        <div class="settings-server-preset-block" id="settings-server-preset-warnings" hidden={true}>
          <strong class="settings-server-preset-title">
            {t("settings-page.server.presets.warnings-heading")}
          </strong>
          <ul class="settings-server-preset-list" id="settings-server-preset-warning-list"></ul>
        </div>
        <div class="settings-server-preset-block">
          <strong class="settings-server-preset-title">
            {t("settings-page.server.presets.changes-heading")}
          </strong>
          <ul class="settings-server-preset-list" id="settings-server-preset-change-list"></ul>
        </div>
        <div class="settings-server-preset-actions">
          <Button variant="primary" id="settings-server-preset-apply">
            {t("settings-page.server.presets.apply")}
          </Button>
          <span
            class="settings-server-preset-status"
            id="settings-server-preset-status"
            role="status"
            aria-live="polite"
          ></span>
        </div>
      </div>
    </div>
  </div>
);
