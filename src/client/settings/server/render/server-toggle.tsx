import { Toggle } from "../../../../shared/ui/components/forms/toggle";

const t = window.scopedT("core");

export interface ServerToggleProps {
  id: string;
  label: string;
  aria?: string;
  title?: string;
  checked?: boolean;
}

export const ServerToggle = ({ id, label, aria, title, checked }: ServerToggleProps): JSX.Element => (
  <Toggle
    id={id}
    label={t(label)}
    aria={aria ? t(aria) : undefined}
    title={title ? t(title) : undefined}
    checked={checked}
  />
);
