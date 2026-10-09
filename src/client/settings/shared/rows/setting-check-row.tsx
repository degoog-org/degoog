import { Icon } from "../../../../shared/ui/components/primitives/icon";
import type { Child } from "../../../../shared/ui/tribute/types";
import { SettingText } from "./setting-text";

export interface SettingCheckRowProps {
  id: string;
  label: string;
  desc?: Child;
  checked?: boolean;
}

export const SettingCheckRow = ({ id, label, desc, checked }: SettingCheckRowProps): JSX.Element => (
  <label class="settings-row settings-row--check degoog-checkbox-wrap">
    <input type="checkbox" id={id} class="settings-toggle" checked={checked === true} />
    <span class="degoog-checkbox">
      <Icon name="fa-solid fa-check" />
    </span>
    <SettingText label={label} desc={desc} />
  </label>
);
