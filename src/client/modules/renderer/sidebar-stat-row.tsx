import { Raw } from "../../../shared/ui/core/raw";

export interface SidebarStatRowProps {
  statusClass: string;
  originHtml: string;
  name: string;
  metaHtml: string;
  retryEngine?: string;
  retryPage?: number;
  retryLabel?: string;
}

export const SidebarStatRow = ({
  statusClass,
  originHtml,
  name,
  metaHtml,
  retryEngine,
  retryPage,
  retryLabel,
}: SidebarStatRowProps): JSX.Element => (
  <div class={statusClass ? `engine-stat-row ${statusClass}` : "engine-stat-row"}>
    <div class="engine-stat-info">
      <div class="engine-stat-label degoog-text">
        <Raw html={originHtml} />
        {name}
      </div>
      <div class="engine-stat-meta degoog-text degoog-text--sm degoog-text--secondary">
        <Raw html={metaHtml} />
      </div>
    </div>
    {retryEngine ? (
      <a class="engine-retry-link degoog-link" data-engine={retryEngine} data-page={retryPage}>
        {retryLabel}
      </a>
    ) : null}
  </div>
);
