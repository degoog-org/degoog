import type { Child } from "../../../../shared/ui/tribute/types";
import { SettingText } from "./setting-text";

export interface SettingSwitchRowProps {
  id: string;
  label: string;
  desc?: Child;
  main?: boolean;
  dep?: string;
  checked?: boolean;
}

export const SettingSwitchRow = ({ id, label, desc, main, dep, checked }: SettingSwitchRowProps): JSX.Element => (
  <label class={main ? "settings-row settings-row--switch settings-row--main" : "settings-row settings-row--switch"} data-dep={dep}>
    <SettingText label={label} desc={desc} />
    <span class="degoog-toggle-wrap">
      <input type="checkbox" id={id} class="settings-toggle" checked={checked === true} />
      <span class="toggle-slider degoog-toggle"></span>
    </span>
  </label>
);
