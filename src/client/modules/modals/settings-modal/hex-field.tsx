import { ExtField } from "./ext-field";
import { DEFAULT_HEX, HEX_RE, normalizeHex } from "./field-widgets";
import type { Child } from "../../../../shared/ui/tribute/types";
import type { SettingField } from "../../../../shared/setting-field";

export interface HexFieldProps {
  field: SettingField;
  value: string;
  desc?: Child;
}

export const HexField = ({
  field,
  value,
  desc,
}: HexFieldProps): JSX.Element => {
  const hex =
    value && HEX_RE.test(value) ? value : field.default || DEFAULT_HEX;
  return (
    <ExtField fieldKey={field.key} type="hex">
      <label class="ext-field-label" for={`field-${field.key}`}>
        {field.label}
      </label>
      <div class="ext-field-hex">
        <input
          class="ext-field-input ext-field-hex-text degoog-input"
          type="text"
          id={`field-${field.key}`}
          value={hex}
          placeholder={field.placeholder || DEFAULT_HEX}
          autocomplete="off"
        />
        <input
          class="ext-field-hex-color"
          type="color"
          value={normalizeHex(hex)}
          aria-label={field.label}
        />
      </div>
      {desc}
    </ExtField>
  );
};
