import { SubLabel } from "./list-sub-label";
import type { SettingField } from "../../../../shared/setting-field";

export const ListToggleSub = ({
  sub,
  value,
}: {
  sub: SettingField;
  value: string;
}): JSX.Element => (
  <label class="ext-list-sub ext-list-sub--toggle">
    <SubLabel label={sub.label} />
    <div class="engine-toggle degoog-toggle-wrap degoog-toggle-wrap--transparent">
      <input
        type="checkbox"
        class="ext-list-subfield"
        data-subkey={sub.key}
        data-subtype="toggle"
        checked={value === "true"}
      />
      <span class="toggle-slider degoog-toggle"></span>
    </div>
  </label>
);
