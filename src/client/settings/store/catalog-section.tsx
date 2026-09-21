const FILTERS = [
  { class: "store-filter-type", label: "Filter by type", hidden: false },
  { class: "store-filter-subtype", label: "Filter by sub-type", hidden: true },
  { class: "store-filter-status", label: "Filter by install status", hidden: false },
];

export const CatalogSection = (): JSX.Element => (
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
