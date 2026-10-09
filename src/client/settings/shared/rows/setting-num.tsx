export interface SettingNumProps {
  id: string;
  saveKey?: string;
  unit?: string;
  min?: number;
  max?: number;
  placeholder?: string;
  label?: string;
}

export const SettingNum = ({ id, saveKey, unit, min, max, placeholder, label }: SettingNumProps): JSX.Element => (
  <span class="settings-num">
    <input
      type="number"
      inputmode="numeric"
      id={id}
      class="degoog-input settings-num-input"
      data-save-key={saveKey}
      min={min}
      max={max}
      step={1}
      placeholder={placeholder}
      aria-label={label}
    />
    {unit ? <span class="settings-unit">{unit}</span> : null}
  </span>
);
