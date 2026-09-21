import { renderHtml } from "../../shared/ui/core/html";

const _mediaHeights = ["140px", "100px", "175px", "115px", "155px", "90px", "135px", "105px"];

const SkeletonLine = ({ variant }: { variant: string }): JSX.Element => (
  <div class={`skeleton-line skeleton-line--${variant}`}></div>
);

const RESULT_LINES = ["url", "title", "snippet", "snippet-short"];
const GLANCE_LINES = ["title", "snippet", "snippet", "snippet-short"];
const SIDEBAR_PANELS = [
  ["title", "snippet", "snippet", "snippet-short"],
  ["title", "snippet", "snippet-short"],
];

const SkeletonCard = (): JSX.Element => (
  <div class="skeleton-card">
    {RESULT_LINES.map((variant) => (
      <SkeletonLine variant={variant} />
    ))}
  </div>
);

const repeat = (count: number, render: () => JSX.Element): JSX.Element[] =>
  Array.from({ length: count }, render);

export const skeletonImageGrid = (cols = 4, rows = 6): string => {
  let hi = 0;
  return renderHtml(
    <div class="skeleton-image-grid">
      {Array.from({ length: cols }, (_, ci) => (
        <div class="image-column">
          {Array.from({ length: rows }, () => (
            <div
              class="skeleton-media-card"
              style={`height:${_mediaHeights[(hi++ + ci * 2) % _mediaHeights.length]}`}
            ></div>
          ))}
        </div>
      ))}
    </div>,
  );
};

export const skeletonResults = (count = 5): string =>
  renderHtml(
    <div class="skeleton-results">{repeat(count, () => <SkeletonCard />)}</div>,
  );

export const skeletonMoreResults = (count = 2): string =>
  renderHtml(
    <div class="skeleton-results skeleton-results--more">
      {repeat(count, () => <SkeletonCard />)}
    </div>,
  );

export const skeletonGlance = (): string =>
  renderHtml(
    <div class="glance-box">
      <div class="skeleton-glance">
        {GLANCE_LINES.map((variant) => (
          <SkeletonLine variant={variant} />
        ))}
      </div>
    </div>,
  );

export const skeletonSidebar = (): string =>
  renderHtml(
    <div class="skeleton-sidebar" aria-hidden="true">
      {SIDEBAR_PANELS.map((lines) => (
        <div class="sidebar-panel skeleton-sidebar-panel degoog-panel">
          {lines.map((variant) => (
            <SkeletonLine variant={variant} />
          ))}
        </div>
      ))}
    </div>,
  );

export const skeletonFeedCards = (count = 4): string =>
  renderHtml(
    <div class="skeleton-feed" aria-hidden="true">
      {repeat(count, () => (
        <div class="skeleton-feed-card">
          <div class="skeleton-feed-image"></div>
          <div class="skeleton-feed-body">
            <div class="skeleton-feed-line skeleton-feed-source"></div>
            <div class="skeleton-feed-line skeleton-feed-title"></div>
          </div>
        </div>
      ))}
    </div>,
  );
