import { IpRow } from "./row";

export const IpInfo = ({ fields }: { fields: Array<[string, string]> }): JSX.Element => (
  <div class="command-ip-info">
    {fields.map(([label, value]) => (
      <IpRow key={label} label={label} value={value} />
    ))}
  </div>
);
