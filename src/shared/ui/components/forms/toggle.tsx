export interface ToggleProps {
  id: string;
  label: string;
  aria?: string;
  title?: string;
  checked?: boolean;
}

export const Toggle = ({ id, label, aria, title, checked }: ToggleProps): JSX.Element => (
  <label class="settings-toggle-wrap degoog-toggle-wrap" title={title}>
    <input
      type="checkbox"
      id={id}
      class="settings-toggle"
      aria-label={aria}
      checked={checked === true}
    />
    <span class="toggle-slider degoog-toggle"></span>
    <span class="settings-toggle-label">{label}</span>
  </label>
);
