import type { Child } from "../../shared/ui/core/types";

export const PaginationWrap = ({ children }: { children?: Child }): JSX.Element => (
  <div class="pagination">{children}</div>
);
