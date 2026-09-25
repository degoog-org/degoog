import { ENGINE_ORIGIN_DISPLAY_VALUES } from "../../../../../shared/engine-origins";
import { FIELDSET, TEXTAREA } from "../classes";
import { SectionDesc } from "../section-desc";
import { ServerLabel } from "../server-label";
import { ServerSection } from "../server-section";
import { ServerToggle } from "../server-toggle";
import { SubHeading } from "../sub-heading";

const t = window.scopedT("core");

export const SearchOptionsSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-search-options"
    heading="settings-page.server.search-options-heading"
    icon="fa-solid fa-arrow-down-1-9"
    desc="settings-page.server.search-options-desc"
  >
    <fieldset class={FIELDSET}>
      <ServerToggle
        id="settings-infinite-scroll-enabled"
        label="settings-page.server.infinite-scroll-enable"
        aria="settings-page.server.infinite-scroll-enable-aria"
      />
      <SectionDesc k="settings-page.server.infinite-scroll-enable-desc" />

      <div class="settings-server-block">
        <SubHeading k="settings-page.server.engine-origins-label" />
        <SectionDesc k="settings-page.server.engine-origins-desc" />
        <div class="degoog-select-wrap">
          <select
            id="settings-engine-origin-display"
            class="degoog-input"
            aria-label={t("settings-page.server.engine-origins-label")}
          >
            {ENGINE_ORIGIN_DISPLAY_VALUES.map((value) => (
              <option value={value}>{t(`settings-page.server.engine-origins-${value}`)}</option>
            ))}
          </select>
        </div>
      </div>

      <ServerToggle id="settings-languages-enabled" label="settings-page.server.languages-toggle" aria="settings-page.server.languages-toggle-aria" />
      <SectionDesc k="settings-page.server.languages-desc" />
      <div
        class="settings-proxy-urls-wrap settings-fieldset settings-fieldset-inverse settings-fieldset--compact"
        id="settings-languages-wrap"
        style="display: none"
      >
        <ServerLabel htmlFor="settings-languages" k="settings-page.server.languages-codes-label" />
        <textarea
          id="settings-languages"
          data-save-key="languages"
          class={TEXTAREA}
          rows={5}
          placeholder={"en\nit\nde\nfr\nes"}
        ></textarea>
      </div>

      <ServerToggle
        id="settings-streaming-enabled"
        label="settings-page.server.streaming-enable"
        aria="settings-page.server.streaming-enable-aria"
        title="settings-page.server.streaming-enable-tooltip"
      />
      <SectionDesc k="settings-page.server.streaming-desc" />
      <div class="settings-streaming-options" id="settings-streaming-options" style="display: none">
        <fieldset class="settings-fieldset settings-fieldset--compact">
          <div id="settings-streaming-type-checks" class="settings-streaming-type-checks"></div>
          <ServerToggle id="settings-streaming-auto-retry" label="settings-page.server.streaming-auto-retry" aria="settings-page.server.streaming-auto-retry-aria" />
          <div
            class="settings-streaming-retry-wrap settings-fieldset settings-fieldset-inverse settings-fieldset--compact"
            id="settings-streaming-retry-wrap"
            style="display: none"
          >
            <ServerLabel htmlFor="settings-streaming-max-retries" k="settings-page.server.streaming-max-retries-label" />
            <input
              type="number"
              id="settings-streaming-max-retries"
              data-save-key="streamingMaxRetries"
              class="settings-rate-limit-input degoog-input"
              min={1}
              max={5}
              placeholder="2"
            />
          </div>
        </fieldset>
      </div>
    </fieldset>
  </ServerSection>
);
