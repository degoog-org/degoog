import { Raw } from "../../../shared/ui/core/raw";

export interface StreamingStatRowProps {
  statusClass: "" | "engine-retrying" | "engine-failed";
  originHtml: string;
  name: string;
  metaHtml: string;
}

export const StreamingStatRow = ({
  statusClass,
  originHtml,
  name,
  metaHtml,
}: StreamingStatRowProps): JSX.Element => (
  <div class={statusClass ? `engine-stat-row ${statusClass}` : "engine-stat-row"}>
    <div class="engine-stat-info">
      <div class="engine-stat-label">
        <Raw html={originHtml} />
        {name}
      </div>
      <div class="engine-stat-meta">
        <Raw html={metaHtml} />
      </div>
    </div>
  </div>
);
