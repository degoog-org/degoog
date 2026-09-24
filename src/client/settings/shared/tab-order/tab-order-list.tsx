import { TabOrderItem } from "./tab-order-item";
import type { TypeEntry } from "../../../types/engines-tab";

export const TabOrderList = ({ entries }: { entries: TypeEntry[] }): JSX.Element => (
  <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:var(--space-2,0.5rem)">
    {entries.map((entry) => (
      <TabOrderItem key={entry.key} entry={entry} />
    ))}
  </ul>
);
