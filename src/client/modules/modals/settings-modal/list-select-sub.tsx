import { SubLabel } from "./list-sub-label";
import type { SettingField } from "../../../types";

export const ListSelectSub = ({
  sub,
  value,
}: {
  sub: SettingField;
  value: string;
}): JSX.Element => {
  const options = sub.options ?? [];
  const selected = options.includes(value) ? value : (options[0] ?? "");
  return (
    <label class="ext-list-sub">
      <SubLabel label={sub.label} />
      <div class="ext-field-select-wrap degoog-select-wrap">
        <select
          class="ext-field-input ext-list-subfield ext-field-select degoog-input"
          data-subkey={sub.key}
          data-subtype="text"
        >
          {options.map((opt, i) => (
            <option key={opt} value={opt} selected={opt === selected}>
              {sub.optionLabels?.[i] ?? opt}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
};
