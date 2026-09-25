export const hasMorePages = (
  currentPage: number,
  lastPage: number | null,
  isExhausted: boolean,
): boolean => {
  if (isExhausted) return false;
  if (lastPage === null) return true;
  return currentPage < lastPage;
};
