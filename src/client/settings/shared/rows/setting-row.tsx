import type { Child } from "../../../../shared/ui/tribute/types";
import { SettingText } from "./setting-text";

export interface SettingRowProps {
  id?: string;
  label?: string;
  desc?: Child;
  forId?: string;
  dep?: string;
  hidden?: boolean;
  children?: Child;
}

export const SettingRow = ({ id, label, desc, forId, dep, hidden, children }: SettingRowProps): JSX.Element => (
  <div class="settings-row" id={id} data-dep={dep} hidden={hidden}>
    <SettingText label={label} desc={desc} forId={forId} />
    <div class="settings-row-control">{children}</div>
  </div>
);
