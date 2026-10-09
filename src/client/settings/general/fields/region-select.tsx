import { REGION_SELECT_ID } from "../toggles";

export interface RegionOption {
  code: string;
  label: string;
}

const t = window.scopedT("core");

export const RegionSelect = ({ regions }: { regions: RegionOption[] }): JSX.Element => (
  <div class="settings-engine-origin-wrap" title={t("settings-page.search-options.region-tooltip")}>
    <label class="settings-proxy-urls-label" for={REGION_SELECT_ID}>
      {t("settings-page.search-options.region")}
    </label>
    <div class="degoog-select-wrap">
      <select id={REGION_SELECT_ID} class="theme-select">
        <option key="none" value="">
          {t("settings-page.search-options.region-none")}
        </option>
        {regions.map(({ code, label }) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
    </div>
  </div>
);
