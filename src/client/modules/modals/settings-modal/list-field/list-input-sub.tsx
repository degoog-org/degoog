import { SubLabel } from "./list-sub-label";
import type { SettingField } from "../../../../../shared/setting-field";

const _inputTypeFor = (type: SettingField["type"]): string => {
  if (type === "url") return "url";
  if (type === "number") return "number";
  if (type === "password") return "password";
  return "text";
};

export const ListInputSub = ({
  sub,
  value,
}: {
  sub: SettingField;
  value: string;
}): JSX.Element => (
  <label class="ext-list-sub">
    <SubLabel label={sub.label} />
    <input
      class="ext-field-input ext-list-subfield degoog-input"
      type={_inputTypeFor(sub.type)}
      data-subkey={sub.key}
      data-subtype="text"
      value={value}
      placeholder={sub.placeholder || ""}
      autocomplete="off"
    />
  </label>
);
