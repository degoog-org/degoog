import { SkeletonLine } from "./skeleton-line";

const GLANCE_LINES = ["title", "snippet", "snippet", "snippet-short"];

export const SkeletonGlance = (): JSX.Element => (
  <div class="glance-box">
    <div class="skeleton-glance">
      {GLANCE_LINES.map((variant) => (
        <SkeletonLine variant={variant} />
      ))}
    </div>
  </div>
);
