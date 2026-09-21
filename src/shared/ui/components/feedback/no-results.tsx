import type { Child } from "../../core/types";

export const NoResults = ({ children }: { children?: Child }): JSX.Element => (
  <div class="no-results">{children}</div>
);
