import { SettingRow } from "../../shared/rows/setting-row";
import { SettingSelect } from "../../shared/rows/setting-select";

const t = window.scopedT("core");

const THEME_OPTIONS = ["system", "light", "dark"] as const;

export const ThemeSelect = (): JSX.Element => (
  <SettingRow label={t("settings-page.appearance.theme-label")} forId="theme-select">
    <SettingSelect id="theme-select">
      {THEME_OPTIONS.map((value) => (
        <option key={value} value={value}>
          {t(`settings-page.theme.${value}`)}
        </option>
      ))}
    </SettingSelect>
  </SettingRow>
);
