import type { Child } from "../../tribute/types";

export interface ExtGroupProps {
  label: string;
  children?: Child;
}

export const ExtGroup = ({ label, children }: ExtGroupProps): JSX.Element => (
  <div class="ext-group">
    <h3 class="ext-group-label">{label}</h3>
    <div class="ext-cards">{children}</div>
  </div>
);
