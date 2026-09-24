import { FIELDSET, FIELDSET_INNER } from "../classes";
import { LimitGrid } from "../limit-grid";
import { ServerSection } from "../server-section";
import { ServerToggle } from "../server-toggle";

const t = window.scopedT("core");

const SEARCH_LIMITS = [
  { id: "settings-rate-limit-burst-window", k: "settings-page.server.rate-limit-burst-window", min: 1, max: 3600, placeholder: "20" },
  { id: "settings-rate-limit-burst-max", k: "settings-page.server.rate-limit-burst-max", min: 1, max: 1000, placeholder: "15" },
  { id: "settings-rate-limit-long-window", k: "settings-page.server.rate-limit-long-window", min: 1, max: 3600, placeholder: "600" },
  { id: "settings-rate-limit-long-max", k: "settings-page.server.rate-limit-long-max", min: 1, max: 1000, placeholder: "150" },
] as const;

const SUGGEST_LIMITS = [
  { id: "settings-rate-limit-suggest-burst-window", k: "settings-page.server.rate-limit-burst-window", min: 1, max: 3600, placeholder: "20" },
  { id: "settings-rate-limit-suggest-burst-max", k: "settings-page.server.rate-limit-burst-max", min: 1, max: 1000, placeholder: "60" },
  { id: "settings-rate-limit-suggest-long-window", k: "settings-page.server.rate-limit-long-window", min: 1, max: 3600, placeholder: "60" },
  { id: "settings-rate-limit-suggest-long-max", k: "settings-page.server.rate-limit-long-max", min: 1, max: 1000, placeholder: "120" },
  { id: "settings-ac-debounce-ms", k: "settings-page.server.ac-debounce", min: 0, max: 2000, placeholder: "300" },
] as const;

export const RateLimitSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-rate-limit"
    heading="settings-page.server.rate-limit-heading"
    icon="fa-solid fa-clock"
    desc="settings-page.server.rate-limit-desc"
  >
    <div class="settings-rate-limit-wrap" id="settings-rate-limit-wrap">
      <fieldset class={FIELDSET}>
        <ServerToggle id="settings-rate-limit-enabled" label="settings-page.server.rate-limit-enable" aria="settings-page.server.rate-limit-enable-aria" />
        <div class="settings-rate-limit-options" id="settings-rate-limit-options" style="display: none">
          <fieldset class={FIELDSET_INNER}>
            <p class="settings-rate-limit-defaults">
              {`${t("settings-page.server.rate-limit-search-group")} - ${t("settings-page.server.rate-limit-defaults")}`}
            </p>
            <LimitGrid fields={SEARCH_LIMITS} />
          </fieldset>
        </div>
        <ServerToggle id="settings-rate-limit-suggest-enabled" label="settings-page.server.rate-limit-suggest-enable" />
        <div id="settings-rate-limit-suggest-options" style="display: none">
          <fieldset class={FIELDSET_INNER}>
            <p class="settings-rate-limit-defaults">
              {`${t("settings-page.server.rate-limit-suggest-group")} - ${t("settings-page.server.rate-limit-suggest-defaults")}`}
            </p>
            <LimitGrid fields={SUGGEST_LIMITS} />
          </fieldset>
        </div>
      </fieldset>
    </div>
  </ServerSection>
);
