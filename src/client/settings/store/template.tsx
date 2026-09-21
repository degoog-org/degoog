import { renderHtml } from "../../../shared/ui/core/html";
import { raw } from "../../../shared/ui/core/raw";
import { Button } from "../../../shared/ui/components/primitives/button";

const REPO_DESC_BEFORE =
  "Add a git repository URL to browse and install plugins, themes, engines, and transports. Set ";
const REPO_DESC_AFTER = " in the repo’s package.json to show an image next to the URL.";

const FILTERS = [
  { class: "store-filter-type", label: "Filter by type", hidden: false },
  { class: "store-filter-subtype", label: "Filter by sub-type", hidden: true },
  { class: "store-filter-status", label: "Filter by install status", hidden: false },
];

const ReposSection = (): JSX.Element => (
  <section class="store-repos-section settings-section ext-card degoog-panel degoog-panel--ext-card">
    <div class="store-repos-header">
      <h2 class="settings-section-heading">Repositories</h2>
      <div class="header-actions">
        <div class="store-repos-actions">
          <Button variant="secondary" class="store-btn-refresh-all">
            Refresh all
          </Button>
        </div>
        <Button variant="primary" class="store-btn-add">
          Add repository
        </Button>
      </div>
    </div>
    <div class="store-add-repo-wrap" style="display:none">
      <input
        type="text"
        class="store-search-input degoog-search-bar degoog-search-bar--square-advanced store-input-url"
        placeholder="https://github.com/user/repo.git"
      />
      <Button variant="primary" class="store-btn-add-confirm" aria-label="Add repository">
        <i class="fa-solid fa-plus" aria-hidden="true"></i>
      </Button>
      <span class="store-inline-error"></span>
    </div>
    <p class="settings-desc">
      {REPO_DESC_BEFORE}
      <code>repo-image</code>
      {REPO_DESC_AFTER}
    </p>
    <div class="store-repo-list-wrap"></div>
    <div class="store-repo-errors" style="display:none"></div>
  </section>
);

const CatalogSection = (): JSX.Element => (
  <section class="store-catalog-section settings-section">
    <div class="store-catalog-header">
      <h2 class="settings-section-heading">Catalog</h2>
    </div>
    <div class="store-updates-panel degoog-accordion" style="display:none"></div>
    <div class="store-filter-bar">
      <input
        type="text"
        class="store-search-input degoog-search-bar degoog-search-bar--square-advanced"
        placeholder="Search Extensions…"
        id="store-search-input"
      />
      <div class="store-filter-bar-dropdowns">
        {FILTERS.map((filter) => (
          <select
            class={`store-filter-select ${filter.class}`}
            aria-label={filter.label}
            style={filter.hidden ? "display:none" : undefined}
          ></select>
        ))}
      </div>
    </div>
    <div class="store-catalog-grid"></div>
  </section>
);

const Lightbox = (): JSX.Element => (
  <div
    class="store-lightbox"
    id="store-lightbox"
    aria-hidden="true"
    role="dialog"
    aria-modal="true"
    aria-label="Screenshot gallery"
  >
    <div class="store-lightbox-backdrop"></div>
    <button class="store-lightbox-close" type="button" aria-label="Close">
      {raw("&times;")}
    </button>
    <button class="store-lightbox-prev" type="button" aria-label="Previous">
      {raw("&larr;")}
    </button>
    <div class="store-lightbox-img-wrap">
      <img class="store-lightbox-img" src="" alt="" />
    </div>
    <button class="store-lightbox-next" type="button" aria-label="Next">
      {raw("&rarr;")}
    </button>
    <div class="store-lightbox-counter"></div>
  </div>
);

export function getStoreTabHtml(): string {
  return renderHtml(
    <>
      <ReposSection />
      <CatalogSection />
      <Lightbox />
    </>,
  );
}
