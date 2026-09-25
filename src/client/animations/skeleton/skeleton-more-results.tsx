import { SkeletonCard } from "./skeleton-card";

export const SkeletonMoreResults = ({ count = 2 }: { count?: number } = {}): JSX.Element => (
  <div class="skeleton-results skeleton-results--more">
    {Array.from({ length: count }, () => (
      <SkeletonCard />
    ))}
  </div>
);
