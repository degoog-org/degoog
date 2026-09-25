import type { Child } from "../../tribute/types";

export const NoResults = ({ children }: { children?: Child }): JSX.Element => (
  <div class="no-results">{children}</div>
);
