import type { Child } from "../../tribute/types";

export const ExtCardDesc = ({ html }: { html: Child }): JSX.Element => (
  <span class="ext-card-desc">{html}</span>
);
