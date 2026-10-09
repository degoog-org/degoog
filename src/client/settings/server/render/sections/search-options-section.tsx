import { ENGINE_ORIGIN_DISPLAY_VALUES } from "../../../../../shared/engine-origins";
import { SettingGroup } from "../../../shared/rows/setting-group";
import { SettingNum } from "../../../shared/rows/setting-num";
import { SettingRow } from "../../../shared/rows/setting-row";
import { SettingSelect } from "../../../shared/rows/setting-select";
import { SettingStackRow } from "../../../shared/rows/setting-stack-row";
import { SettingSwitchRow } from "../../../shared/rows/setting-switch-row";
import { ServerSection } from "../server-section";

const t = window.scopedT("core");

export const SearchOptionsSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-search-options"
    heading="settings-page.server.search-options-heading"
    icon="fa-solid fa-arrow-down-1-9"
    desc="settings-page.server.search-options-desc"
  >
    <SettingGroup>
      <SettingSwitchRow
        id="settings-infinite-scroll-enabled"
        label={t("settings-page.server.infinite-scroll-enable")}
        desc={t("settings-page.server.infinite-scroll-enable-desc")}
        main={true}
      />
    </SettingGroup>
    <SettingGroup>
      <SettingRow
        label={t("settings-page.server.engine-origins-label")}
        desc={t("settings-page.server.engine-origins-desc")}
        forId="settings-engine-origin-display"
      >
        <SettingSelect id="settings-engine-origin-display">
          {ENGINE_ORIGIN_DISPLAY_VALUES.map((value) => (
            <option value={value}>{t(`settings-page.server.engine-origins-${value}`)}</option>
          ))}
        </SettingSelect>
      </SettingRow>
    </SettingGroup>
    <SettingGroup>
      <SettingSwitchRow
        id="settings-languages-enabled"
        label={t("settings-page.server.languages-toggle")}
        desc={t("settings-page.server.languages-desc")}
        main={true}
      />
      <SettingStackRow
        label={t("settings-page.server.languages-codes-label")}
        desc={t("settings-page.server.one-per-line")}
        forId="settings-languages"
        dep="settings-languages-enabled"
      >
        <textarea
          id="settings-languages"
          data-save-key="languages"
          class="degoog-input settings-textarea settings-textarea--mono"
          rows={5}
          spellcheck="false"
          placeholder={"en\nit\nde"}
        ></textarea>
      </SettingStackRow>
    </SettingGroup>
    <SettingGroup>
      <SettingSwitchRow
        id="settings-streaming-enabled"
        label={t("settings-page.server.streaming-enable")}
        desc={t("settings-page.server.streaming-desc")}
        main={true}
      />
      <SettingStackRow
        id="settings-streaming-types-row"
        label={t("settings-page.server.streaming-types-label")}
        desc={<span id="settings-streaming-types-count"></span>}
        dep="settings-streaming-enabled"
      >
        <span class="settings-filter" id="settings-streaming-types-filter-wrap" hidden={true}>
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          <input
            type="search"
            class="degoog-input"
            id="settings-streaming-types-filter"
            placeholder={t("settings-page.server.streaming-types-filter")}
            aria-label={t("settings-page.server.streaming-types-filter")}
          />
        </span>
        <div id="settings-streaming-type-checks" class="settings-type-grid"></div>
      </SettingStackRow>
      <SettingSwitchRow
        id="settings-streaming-auto-retry"
        label={t("settings-page.server.streaming-auto-retry")}
        dep="settings-streaming-enabled"
      />
      <SettingRow
        label={t("settings-page.server.streaming-max-retries-label")}
        forId="settings-streaming-max-retries"
        dep="settings-streaming-auto-retry"
      >
        <SettingNum id="settings-streaming-max-retries" saveKey="streamingMaxRetries" min={1} max={5} placeholder="2" />
      </SettingRow>
    </SettingGroup>
  </ServerSection>
);
