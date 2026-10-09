import type { Child } from "../../../../shared/ui/tribute/types";

export const SettingSelect = ({ id, label, children }: { id: string; label?: string; children?: Child }): JSX.Element => (
  <span class="degoog-select-wrap settings-select-wrap">
    <select id={id} class="degoog-input" aria-label={label}>
      {children}
    </select>
  </span>
);
