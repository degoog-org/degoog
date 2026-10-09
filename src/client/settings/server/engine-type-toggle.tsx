import { Icon } from "../../../shared/ui/components/primitives/icon";

export const EngineTypeToggle = ({
  type,
  checked,
  onChange,
}: {
  type: string;
  checked: boolean;
  onChange: () => void;
}): JSX.Element => (
  <label class="degoog-checkbox-wrap settings-type-check" data-type={type}>
    <input type="checkbox" class="settings-toggle" value={type} checked={checked} onChange={onChange} />
    <span class="degoog-checkbox">
      <Icon name="fa-solid fa-check" />
    </span>
    <span class="settings-type-name">{type}</span>
  </label>
);
