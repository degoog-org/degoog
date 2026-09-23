import { SubLabel } from "./list-sub-label";
import { HEX_RE, DEFAULT_HEX, normalizeHex } from "./field-widgets";
import type { SettingField } from "../../../../shared/setting-field";

export const ListHexSub = ({
  sub,
  value,
}: {
  sub: SettingField;
  value: string;
}): JSX.Element => {
  const hex = value && HEX_RE.test(value) ? value : sub.default || DEFAULT_HEX;
  return (
    <div class="ext-list-sub">
      <SubLabel label={sub.label} />
      <div class="ext-field-hex">
        <input
          class="ext-field-input ext-list-subfield ext-list-hex-text degoog-input"
          type="text"
          data-subkey={sub.key}
          data-subtype="text"
          value={hex}
          placeholder={sub.placeholder || DEFAULT_HEX}
          autocomplete="off"
        />
        <input
          class="ext-field-hex-color ext-list-hex-color"
          type="color"
          value={normalizeHex(hex)}
          aria-label={sub.label}
        />
      </div>
    </div>
  );
};
