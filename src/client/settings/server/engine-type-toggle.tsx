export const EngineTypeToggle = ({
  type,
  checked,
  onChange,
}: {
  type: string;
  checked: boolean;
  onChange: () => void;
}): JSX.Element => (
  <label class="degoog-checkbox-wrap">
    <input
      type="checkbox"
      class="settings-toggle"
      value={type}
      checked={checked}
      onChange={onChange}
    />
    <span class="degoog-checkbox">
      <i class="fa-solid fa-check"></i>
    </span>
    <span class="settings-toggle-label">{type}</span>
  </label>
);
