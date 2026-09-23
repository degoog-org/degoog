import { Icon } from "../primitives/icon";

export interface CheckboxProps {
  id: string;
  label: string;
  aria?: string;
  title?: string;
  checked?: boolean;
}

export const Checkbox = ({ id, label, aria, title, checked }: CheckboxProps): JSX.Element => (
  <label class="degoog-checkbox-wrap" title={title}>
    <input
      type="checkbox"
      id={id}
      class="settings-toggle"
      aria-label={aria}
      checked={checked === true}
    />
    <span class="degoog-checkbox">
      <Icon name="fa-solid fa-check" />
    </span>
    <span class="settings-toggle-label">{label}</span>
  </label>
);
