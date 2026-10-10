import { ENGINE_ORIGIN_DISPLAY_VALUES } from "../../../../shared/engine-origins";
import { SettingRow } from "../../shared/rows/setting-row";
import { SettingSelect } from "../../shared/rows/setting-select";
import { INSTANCE_DEFAULT_VALUE } from "../toggles";

const t = window.scopedT("core");

export const EngineOriginSelect = (): JSX.Element => (
  <SettingRow
    label={t("settings-page.search-options.engine-origins")}
    desc={t("settings-page.search-options.engine-origins-desc")}
    forId="engine-origin-select"
  >
    <SettingSelect id="engine-origin-select">
      {[INSTANCE_DEFAULT_VALUE, ...ENGINE_ORIGIN_DISPLAY_VALUES].map((value) => (
        <option key={value || "instance-default"} value={value}>
          {t(`settings-page.search-options.engine-origins-${value || "instance-default"}`)}
        </option>
      ))}
    </SettingSelect>
  </SettingRow>
);
