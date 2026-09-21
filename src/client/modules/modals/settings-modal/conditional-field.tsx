import type { Child } from "../../../../shared/ui/core/types";

export interface ConditionalFieldProps {
  depKey: string;
  equals: string;
  show: boolean;
  children?: Child;
}

export const ConditionalField = ({
  depKey,
  equals,
  show,
  children,
}: ConditionalFieldProps): JSX.Element => (
  <div
    class="ext-conditional-field"
    hidden={!show}
    data-visible-dep-key={depKey}
    data-visible-dep-equals={equals}
  >
    {children}
  </div>
);
