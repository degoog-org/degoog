const t = window.scopedT("themes/degoog");

export const PaginationPages = ({
  startPage,
  endPage,
  activePage,
}: {
  startPage: number;
  endPage: number;
  activePage: number;
}): JSX.Element => {
  const pages: number[] = [];
  for (let page = startPage; page <= endPage; page++) pages.push(page);
  return (
    <div class="pagination-pages">
      {pages.map((page) =>
        page === activePage ? (
          <span key={page} class="pagination-current" aria-current="page">
            {page}
          </span>
        ) : (
          <a
            key={page}
            class="pagination-link"
            data-page={page}
            aria-label={t("search-templates.pagination.page", { page: String(page) })}
          >
            {page}
          </a>
        ),
      )}
    </div>
  );
};
