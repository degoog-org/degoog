import { SettingRow } from "../../shared/rows/setting-row";
import { SettingSelect } from "../../shared/rows/setting-select";
import { REGION_SELECT_ID } from "../toggles";

export interface RegionOption {
  code: string;
  label: string;
}

const t = window.scopedT("core");

export const RegionSelect = ({ regions }: { regions: RegionOption[] }): JSX.Element => (
  <SettingRow
    label={t("settings-page.search-options.region")}
    desc={t("settings-page.search-options.region-desc")}
    forId={REGION_SELECT_ID}
  >
    <SettingSelect id={REGION_SELECT_ID}>
      <option key="none" value="">
        {t("settings-page.search-options.region-none")}
      </option>
      {regions.map(({ code, label }) => (
        <option key={code} value={code}>
          {label}
        </option>
      ))}
    </SettingSelect>
  </SettingRow>
);
