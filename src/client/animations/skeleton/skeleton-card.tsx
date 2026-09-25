import { SkeletonLine } from "./skeleton-line";

const RESULT_LINES = ["url", "title", "snippet", "snippet-short"];

export const SkeletonCard = (): JSX.Element => (
  <div class="skeleton-card">
    {RESULT_LINES.map((variant) => (
      <SkeletonLine variant={variant} />
    ))}
  </div>
);
