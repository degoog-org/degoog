import { INSTANCE_DEFAULT_VALUE } from "../toggles";
import { ENGINE_ORIGIN_DISPLAY_VALUES } from "../../../../shared/engine-origins";

const t = window.scopedT("core");

export const EngineOriginSelect = (): JSX.Element => (
  <div class="settings-engine-origin-wrap">
    <label class="settings-proxy-urls-label" for="engine-origin-select">
      {t("settings-page.search-options.engine-origins")}
    </label>
    <div class="degoog-select-wrap">
      <select id="engine-origin-select" class="theme-select">
        {[INSTANCE_DEFAULT_VALUE, ...ENGINE_ORIGIN_DISPLAY_VALUES].map((value) => (
          <option key={value || "instance-default"} value={value}>
            {t(
              `settings-page.search-options.engine-origins-${value || "instance-default"}`,
            )}
          </option>
        ))}
      </select>
    </div>
  </div>
);
