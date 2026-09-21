import { Raw } from "../../shared/ui/core/raw";

export const PaginationWrap = ({ html }: { html: string }): JSX.Element => (
  <div class="pagination">
    <Raw html={html} />
  </div>
);
