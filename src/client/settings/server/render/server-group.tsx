import type { Child } from "../../../../shared/ui/tribute/types";

const t = window.scopedT("core");

export const ServerGroup = ({ label, children }: { label: string; children?: Child }): JSX.Element => (
  <div class="settings-accordion-group">
    <h3 class="settings-accordion-group-heading">{t(label)}</h3>
    {children}
  </div>
);
