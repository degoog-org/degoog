export const SkeletonFeedCards = ({ count = 4 }: { count?: number } = {}): JSX.Element => (
  <div class="skeleton-feed" aria-hidden="true">
    {Array.from({ length: count }, () => (
      <div class="skeleton-feed-card">
        <div class="skeleton-feed-image"></div>
        <div class="skeleton-feed-body">
          <div class="skeleton-feed-line skeleton-feed-source"></div>
          <div class="skeleton-feed-line skeleton-feed-title"></div>
        </div>
      </div>
    ))}
  </div>
);
