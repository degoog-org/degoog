import { SettingNum } from "../../shared/rows/setting-num";
import { SettingRow } from "../../shared/rows/setting-row";

const t = window.scopedT("core");

export interface RateRowProps {
  label: string;
  maxId: string;
  windowId: string;
  maxPlaceholder: string;
  windowPlaceholder: string;
  dep: string;
}

export const RateRow = ({ label, maxId, windowId, maxPlaceholder, windowPlaceholder, dep }: RateRowProps): JSX.Element => (
  <SettingRow label={label} dep={dep}>
    <span class="settings-rate">
      <SettingNum id={maxId} min={1} max={1000} placeholder={maxPlaceholder} label={`${label}, ${t("settings-page.server.rate-limit-requests")}`} />
      <span class="settings-unit">{t("settings-page.server.rate-limit-per")}</span>
      <SettingNum
        id={windowId}
        min={1}
        max={3600}
        placeholder={windowPlaceholder}
        unit={t("settings-page.server.unit-seconds")}
        label={`${label}, ${t("settings-page.server.unit-seconds")}`}
      />
    </span>
  </SettingRow>
);
