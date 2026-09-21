import { SubLabel } from "./list-sub-label";
import type { SettingField } from "../../../types";

export const ListTextareaSub = ({
  sub,
  value,
}: {
  sub: SettingField;
  value: string;
}): JSX.Element => (
  <label class="ext-list-sub">
    <SubLabel label={sub.label} />
    <textarea
      class="ext-field-input ext-list-subfield degoog-input"
      data-subkey={sub.key}
      data-subtype="text"
      rows={2}
      placeholder={sub.placeholder || ""}
      autocomplete="off"
    >
      {value}
    </textarea>
  </label>
);
