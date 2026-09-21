export const EngineStatReason = ({
  reason,
  label,
}: {
  reason: string;
  label: string;
}): JSX.Element => (
  <span class="engine-stat-reason" data-tooltip={reason} tabindex="0">
    {label}
  </span>
);
