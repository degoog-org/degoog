export const IpRow = ({ label, value }: { label: string; value: string }): JSX.Element => (
  <div class="ip-row">
    <span class="ip-label">{label}</span>
    <span class="ip-value">{value}</span>
  </div>
);
