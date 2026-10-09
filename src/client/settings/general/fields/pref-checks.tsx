import { SettingCheckRow } from "../../shared/rows/setting-check-row";
import type { PrefCheck } from "../toggles";

const t = window.scopedT("core");

export const PrefChecks = ({ checks }: { checks: PrefCheck[] }): JSX.Element => (
  <>
    {checks.map((check) => (
      <SettingCheckRow
        key={check.id}
        id={check.id}
        label={t(check.labelKey)}
        desc={check.descKey ? t(check.descKey) : undefined}
      />
    ))}
  </>
);
