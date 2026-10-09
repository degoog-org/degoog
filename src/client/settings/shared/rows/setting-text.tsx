import type { Child } from "../../../../shared/ui/tribute/types";

export interface SettingTextProps {
  label?: string;
  desc?: Child;
  forId?: string;
}

export const SettingText = ({ label, desc, forId }: SettingTextProps): JSX.Element => (
  <span class="settings-row-text">
    {label && forId ? (
      <label class="settings-row-label" for={forId}>
        {label}
      </label>
    ) : label ? (
      <span class="settings-row-label">{label}</span>
    ) : null}
    {desc ? <span class="settings-row-desc">{desc}</span> : null}
  </span>
);
