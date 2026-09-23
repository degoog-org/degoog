import { SkeletonLine } from "./skeleton-line";

const SIDEBAR_PANELS = [
  ["title", "snippet", "snippet", "snippet-short"],
  ["title", "snippet", "snippet-short"],
];

export const SkeletonSidebar = (): JSX.Element => (
  <div class="skeleton-sidebar" aria-hidden="true">
    {SIDEBAR_PANELS.map((lines) => (
      <div class="sidebar-panel skeleton-sidebar-panel degoog-panel">
        {lines.map((variant) => (
          <SkeletonLine variant={variant} />
        ))}
      </div>
    ))}
  </div>
);
