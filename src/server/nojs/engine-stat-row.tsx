import type { Child } from "../../shared/ui/tribute/types";

export interface EngineStatRowProps {
  failed: boolean;
  originSlot: Child;
  name: string;
  meta: Child;
  retryHref?: string;
  retryLabel?: string;
}

export const EngineStatRow = ({
  failed,
  originSlot,
  name,
  meta,
  retryHref,
  retryLabel,
}: EngineStatRowProps): JSX.Element => (
  <div class={failed ? "engine-stat-row engine-failed" : "engine-stat-row"}>
    <div class="engine-stat-info">
      <div class="engine-stat-label degoog-text">
        {originSlot}
        {name}
      </div>
      <div class="engine-stat-meta degoog-text degoog-text--sm degoog-text--secondary">
        {meta}
      </div>
    </div>
    {retryHref ? (
      <a class="engine-retry-link degoog-link" href={retryHref}>
        {retryLabel}
      </a>
    ) : null}
  </div>
);
