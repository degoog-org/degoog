import type { Child } from "../../../../shared/ui/core/types";

export interface ExtFieldProps {
  fieldKey: string;
  type: string;
  extra?: Record<string, string | undefined>;
  children?: Child;
}

export const ExtField = ({
  fieldKey,
  type,
  extra,
  children,
}: ExtFieldProps): JSX.Element => (
  <div class="ext-field" data-key={fieldKey} data-type={type} {...(extra ?? {})}>
    {children}
  </div>
);
