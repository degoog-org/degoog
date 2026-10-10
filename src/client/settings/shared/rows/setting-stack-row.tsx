import type { Child } from "../../../../shared/ui/tribute/types";
import { SettingText } from "./setting-text";

export interface SettingStackRowProps {
  id?: string;
  label?: string;
  desc?: Child;
  forId?: string;
  dep?: string;
  hidden?: boolean;
  class?: string;
  children?: Child;
}

export const SettingStackRow = ({
  id,
  label,
  desc,
  forId,
  dep,
  hidden,
  class: extra,
  children,
}: SettingStackRowProps): JSX.Element => (
  <div class={extra ? `settings-row settings-row--stack ${extra}` : "settings-row settings-row--stack"} id={id} data-dep={dep} hidden={hidden}>
    {label || desc ? <SettingText label={label} desc={desc} forId={forId} /> : null}
    <div class="settings-row-full">{children}</div>
  </div>
);
