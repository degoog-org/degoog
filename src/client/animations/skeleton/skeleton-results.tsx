import { SkeletonCard } from "./skeleton-card";

export const SkeletonResults = ({ count = 5 }: { count?: number } = {}): JSX.Element => (
  <div class="skeleton-results">
    {Array.from({ length: count }, () => (
      <SkeletonCard />
    ))}
  </div>
);
