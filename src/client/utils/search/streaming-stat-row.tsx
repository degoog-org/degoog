import type { Child } from "../../../shared/ui/tribute/types";

export interface StreamingStatRowProps {
  statusClass: "" | "engine-retrying" | "engine-failed";
  origin: Child;
  name: string;
  meta: Child;
}

export const StreamingStatRow = ({
  statusClass,
  origin,
  name,
  meta,
}: StreamingStatRowProps): JSX.Element => (
  <div
    class={statusClass ? `engine-stat-row ${statusClass}` : "engine-stat-row"}
  >
    <div class="engine-stat-info">
      <div class="engine-stat-label">
        {origin}
        {name}
      </div>
      <div class="engine-stat-meta">{meta}</div>
    </div>
  </div>
);
