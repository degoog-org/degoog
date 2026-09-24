const t = window.scopedT("themes/degoog");

export const PaginationNav = ({
  activePage,
  hasNext,
}: {
  activePage: number;
  hasNext: boolean;
}): JSX.Element => (
  <div class="pagination-pages pagination-pages--nav">
    {activePage > 1 ? (
      <a class="pagination-nav" data-page={activePage - 1}>
        <i class="fa-solid fa-chevron-left"></i>
        <span>{t("search-templates.pagination.previous")}</span>
      </a>
    ) : null}
    <span class="pagination-page-label">
      {t("search-templates.pagination.page", { page: String(activePage) })}
    </span>
    {hasNext ? (
      <a class="pagination-nav" data-page={activePage + 1}>
        <span>{t("search-templates.pagination.next")}</span>
        <i class="fa-solid fa-chevron-right"></i>
      </a>
    ) : null}
  </div>
);
