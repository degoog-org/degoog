import type { Child } from "../../../../shared/ui/tribute/types";

export const FilterSummary = ({
  clearLabel,
  onClear,
  children,
}: {
  clearLabel: string;
  onClear: () => void;
  children?: Child;
}): JSX.Element => (
  <div class="filter-summary">
    <span class="filter-summary-text">{children}</span>
    <button type="button" class="settings-linkish" onClick={onClear}>
      {clearLabel}
    </button>
  </div>
);
