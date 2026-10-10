import type { Child } from "../../../../shared/ui/tribute/types";

export const SettingGroup = ({ id, hidden, children }: { id?: string; hidden?: boolean; children?: Child }): JSX.Element => (
  <div class="settings-group" id={id} hidden={hidden}>
    {children}
  </div>
);
