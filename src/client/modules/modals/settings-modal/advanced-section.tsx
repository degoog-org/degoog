import { Raw } from "../../../../shared/ui/core/raw";

export interface AdvancedSectionProps {
  label: string;
  expanded: boolean;
  fieldsHtml: string;
}

export const AdvancedSection = ({
  label,
  expanded,
  fieldsHtml,
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
      <Raw html={fieldsHtml} />
    </div>
  </div>
);
