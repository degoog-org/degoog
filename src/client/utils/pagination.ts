const t = window.scopedT("themes/degoog");

export const buildNavPaginationHtml = (
  activePage: number,
  hasNext: boolean,
): string => {
  const parts: string[] = ['<div class="pagination-pages pagination-pages--nav">'];
  if (activePage > 1) {
    parts.push(
      `<a class="pagination-nav" data-page="${activePage - 1}"><i class="fa-solid fa-chevron-left"></i><span>${t("search-templates.pagination.previous")}</span></a>`,
    );
  }
  parts.push(
    `<span class="pagination-page-label">${t("search-templates.pagination.page", { page: String(activePage) })}</span>`,
  );
  if (hasNext) {
    parts.push(
      `<a class="pagination-nav" data-page="${activePage + 1}"><span>${t("search-templates.pagination.next")}</span><i class="fa-solid fa-chevron-right"></i></a>`,
    );
  }
  parts.push("</div>");
  return parts.join("");
};

export const buildPaginationHtml = (
  totalPages: number,
  activePage: number,
): string => {
  const maxVisible = 10;
  let startPage = Math.max(1, activePage - Math.floor(maxVisible / 2));
  const endPage = Math.min(totalPages, startPage + maxVisible - 1);

  if (endPage - startPage < maxVisible - 1) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }
  let html = '<div class="pagination-pages">';
  for (let i = startPage; i <= endPage; i++) {
    if (i === activePage) {
      html += `<span class="pagination-current" aria-current="page">${i}</span>`;
    } else {
      html += `<a class="pagination-link" data-page="${i}" aria-label="${t("search-templates.pagination.page", { page: String(i) })}">${i}</a>`;
    }
  }
  html += "</div>";
  return html;
};
