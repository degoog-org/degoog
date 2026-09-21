export const SkeletonLine = ({ variant }: { variant: string }): JSX.Element => (
  <div class={`skeleton-line skeleton-line--${variant}`}></div>
);
