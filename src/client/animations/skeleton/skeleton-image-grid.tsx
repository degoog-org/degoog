const MEDIA_HEIGHTS = ["140px", "100px", "175px", "115px", "155px", "90px", "135px", "105px"];

export interface SkeletonImageGridProps {
  cols?: number;
  rows?: number;
}

export const SkeletonImageGrid = ({
  cols = 4,
  rows = 6,
}: SkeletonImageGridProps = {}): JSX.Element => {
  let hi = 0;
  return (
    <div class="skeleton-image-grid">
      {Array.from({ length: cols }, (_, ci) => (
        <div class="image-column">
          {Array.from({ length: rows }, () => (
            <div
              class="skeleton-media-card"
              style={`height:${MEDIA_HEIGHTS[(hi++ + ci * 2) % MEDIA_HEIGHTS.length]}`}
            ></div>
          ))}
        </div>
      ))}
    </div>
  );
};
