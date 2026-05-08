export function getStoreTabHtml(): string {
  return `
    <section class="store-repos-section settings-section ext-card degoog-panel degoog-panel--ext-card">
      <div class="store-repos-header">
        <h2 class="settings-section-heading">Repositories</h2>
        <div class="header-actions">
          <div class="store-repos-actions">
            <button class="btn btn--secondary degoog-btn degoog-btn--secondary store-btn-refresh-all" type="button">Refresh all</button>
          </div>
          <button class="btn btn--primary degoog-btn degoog-btn--primary store-btn-add" type="button">Add repository</button>
        </div>
      </div>
      <div class="store-add-repo-wrap" style="display:none">
        <input type="text" class="store-search-input degoog-search-bar degoog-search-bar--square-advanced store-input-url" placeholder="https://github.com/user/repo.git">
        <button class="btn btn--primary degoog-btn degoog-btn--primary store-btn-add-confirm" type="button">Add</button>
        <span class="store-inline-error"></span>
      </div>
      <p class="settings-desc">Add a git repository URL to browse and install plugins, themes, engines, and transports. Set <code>repo-image</code> in the repo’s package.json to show an image next to the URL.</p>
      <div class="store-repo-list-wrap"></div>
    </section>
    <section class="store-catalog-section settings-section">
      <div class="store-catalog-header">
        <h2 class="settings-section-heading">Catalog</h2>
      </div>
      <div class="store-updates-panel degoog-accordion" style="display:none"></div>
      <div class="store-filter-bar">
        <input type="text" class="store-search-input degoog-search-bar degoog-search-bar--square-advanced" placeholder="Search…" id="store-search-input">
        <select class="store-filter-select store-filter-type" aria-label="Filter by type"></select>
        <select class="store-filter-select store-filter-subtype" aria-label="Filter by sub-type" style="display:none"></select>
      </div>
      <div class="store-catalog-grid"></div>
    </section>
    <div class="store-lightbox" id="store-lightbox" aria-hidden="true" role="dialog" aria-modal="true" aria-label="Screenshot gallery">
      <div class="store-lightbox-backdrop"></div>
      <button class="store-lightbox-close" type="button" aria-label="Close">&times;</button>
      <button class="store-lightbox-prev" type="button" aria-label="Previous">&larr;</button>
      <div class="store-lightbox-img-wrap">
        <img class="store-lightbox-img" src="" alt="">
      </div>
      <button class="store-lightbox-next" type="button" aria-label="Next">&rarr;</button>
      <div class="store-lightbox-counter"></div>
    </div>`;
}
