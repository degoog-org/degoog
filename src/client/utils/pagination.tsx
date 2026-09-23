import { PaginationPages } from "./pagination-pages";

const MAX_VISIBLE = 10;

export const Pagination = ({
  totalPages,
  activePage,
}: {
  totalPages: number;
  activePage: number;
}): JSX.Element => {
  let startPage = Math.max(1, activePage - Math.floor(MAX_VISIBLE / 2));
  const endPage = Math.min(totalPages, startPage + MAX_VISIBLE - 1);

  if (endPage - startPage < MAX_VISIBLE - 1) {
    startPage = Math.max(1, endPage - MAX_VISIBLE + 1);
  }
  return (
    <PaginationPages startPage={startPage} endPage={endPage} activePage={activePage} />
  );
};
