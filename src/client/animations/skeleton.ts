const _mediaHeights = ["140px", "100px", "175px", "115px", "155px", "90px", "135px", "105px"];

export const skeletonImageGrid = (cols = 4, rows = 6): string => {
  let hi = 0;
  const columns = Array.from({ length: cols }, (_, ci) =>
    `<div class="image-column">${Array.from({ length: rows }, () => {
      const h = _mediaHeights[(hi++ + ci * 2) % _mediaHeights.length];
      return `<div class="skeleton-media-card" style="height:${h}"></div>`;
    }).join("")}</div>`
  ).join("");
  return `<div class="skeleton-image-grid">${columns}</div>`;
};

export const skeletonVideoGrid = (count = 12): string => {
  const items = Array.from({ length: count }, () =>
    `<div class="skeleton-video-card"><div class="skeleton-media-thumb"></div></div>`
  ).join("");
  return `<div class="skeleton-video-grid">${items}</div>`;
};

const _skeletonCard = (): string =>
  `<div class="skeleton-card">
    <div class="skeleton-line skeleton-line--url"></div>
    <div class="skeleton-line skeleton-line--title"></div>
    <div class="skeleton-line skeleton-line--snippet"></div>
    <div class="skeleton-line skeleton-line--snippet-short"></div>
  </div>`;

export const skeletonResults = (count = 5): string =>
  `<div class="skeleton-results">${Array.from({ length: count }, _skeletonCard).join("")}</div>`;

export const skeletonGlance = (): string =>
  `<div class="glance-box">
    <div class="skeleton-glance">
      <div class="skeleton-line skeleton-line--title"></div>
      <div class="skeleton-line skeleton-line--snippet"></div>
      <div class="skeleton-line skeleton-line--snippet"></div>
      <div class="skeleton-line skeleton-line--snippet-short"></div>
    </div>
  </div>`;

export const skeletonFeedCards = (count = 4): string =>
  `<div class="skeleton-feed" aria-hidden="true">${Array.from(
    { length: count },
    () => `
    <div class="skeleton-feed-card">
      <div class="skeleton-feed-image"></div>
      <div class="skeleton-feed-body">
        <div class="skeleton-feed-line skeleton-feed-source"></div>
        <div class="skeleton-feed-line skeleton-feed-title"></div>
      </div>
    </div>`,
  ).join("")}</div>`;
