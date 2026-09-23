import type { Child } from "../../../shared/ui/tribute/types";

export interface SidebarStatRowProps {
  statusClass: string;
  origin: Child;
  name: string;
  meta: Child;
  retryEngine?: string;
  retryPage?: number;
  retryLabel?: string;
}

export const SidebarStatRow = ({
  statusClass,
  origin,
  name,
  meta,
  retryEngine,
  retryPage,
  retryLabel,
}: SidebarStatRowProps): JSX.Element => (
  <div
    class={statusClass ? `engine-stat-row ${statusClass}` : "engine-stat-row"}
  >
    <div class="engine-stat-info">
      <div class="engine-stat-label degoog-text">
        {origin}
        {name}
      </div>
      <div class="engine-stat-meta degoog-text degoog-text--sm degoog-text--secondary">
        {meta}
      </div>
    </div>
    {retryEngine ? (
      <a
        class="engine-retry-link degoog-link"
        data-engine={retryEngine}
        data-page={retryPage}
      >
        {retryLabel}
      </a>
    ) : null}
  </div>
);
