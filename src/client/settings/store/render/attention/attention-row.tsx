import type { Child } from "../../../../../shared/ui/tribute/types";

export const AttentionRow = ({
  label,
  desc,
  control,
}: {
  label: Child;
  desc: Child;
  control: Child;
}): JSX.Element => (
  <div class="settings-row store-att-row">
    <span class="settings-row-text">
      {label}
      <span class="settings-row-desc">{desc}</span>
    </span>
    <div class="settings-row-control">{control}</div>
  </div>
);
