import { FieldLabel } from "../../../../shared/ui/components/forms/field-label";

const t = window.scopedT("core");

export const ServerLabel = ({ htmlFor, k }: { htmlFor: string; k: string }): JSX.Element => (
  <FieldLabel htmlFor={htmlFor} text={t(k)} />
);
