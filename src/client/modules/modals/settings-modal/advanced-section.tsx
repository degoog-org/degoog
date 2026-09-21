import type { Child } from "../../../../shared/ui/core/types";

export interface AdvancedSectionProps {
  label: string;
  expanded: boolean;
  children?: Child;
}

export const AdvancedSection = ({
  label,
  expanded,
  children,
}: AdvancedSectionProps): JSX.Element => (
  <div class="ext-advanced-section">
    <label class="ext-field-toggle-row ext-advanced-header">
      <span class="ext-field-label">{label}</span>
      <label class="engine-toggle degoog-toggle-wrap degoog-toggle-wrap--transparent">
        <input type="checkbox" class="ext-advanced-toggle" checked={expanded} />
        <span class="toggle-slider degoog-toggle"></span>
      </label>
    </label>
    <div class="ext-advanced-body" hidden={!expanded}>
      {children}
    </div>
  </div>
);
