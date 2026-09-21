import { renderHtml } from "../../shared/ui/core/html";
import { PaginationNav } from "./pagination-nav";
import { PaginationPages } from "./pagination-pages";

export const buildNavPaginationHtml = (
  activePage: number,
  hasNext: boolean,
): string => renderHtml(<PaginationNav activePage={activePage} hasNext={hasNext} />);

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
  return renderHtml(
    <PaginationPages startPage={startPage} endPage={endPage} activePage={activePage} />,
  );
};
