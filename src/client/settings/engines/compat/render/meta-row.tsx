import { CompatMissingDot } from "./missing-dot";

export interface CompatMetaRowProps {
  label: string;
  value: string;
  hint: string;
  layer: string;
  missing?: boolean;
}

export const CompatMetaRow = ({
  label,
  value,
  hint,
  layer,
  missing = false,
}: CompatMetaRowProps): JSX.Element => (
  <span class="ext-card-desc">
    <strong
      class="compat-meta-key"
      data-tooltip={hint}
      data-tooltip-below={true}
      data-tooltip-start={true}
    >
      {label}
    </strong>
    {": "}
    {value}
    {missing ? <CompatMissingDot layer={layer} /> : null}
  </span>
);
