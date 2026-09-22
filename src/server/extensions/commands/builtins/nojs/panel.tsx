import type { Child } from "../../../../../shared/ui/tribute/types";

export const NojsPanel = ({ children }: { children?: Child }): JSX.Element => (
  <div class="command-result command-nojs">{children}</div>
);
