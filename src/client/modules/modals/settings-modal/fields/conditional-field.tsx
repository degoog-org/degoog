import type { Child } from "../../../../../shared/ui/tribute/types";
import type { VisibleWhenRule } from "../../../../../shared/setting-field";

export interface ConditionalFieldProps {
  rules: VisibleWhenRule[];
  show: boolean;
  children?: Child;
}

export const ConditionalField = ({
  rules,
  show,
  children,
}: ConditionalFieldProps): JSX.Element => (
  <div
    class="ext-conditional-field"
    hidden={!show}
    data-visible-when={JSON.stringify(rules)}
  >
    {children}
  </div>
);
