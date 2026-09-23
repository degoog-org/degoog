import { NumberField } from "../../../../shared/ui/components/forms/number-field";

export interface NumberInlineProps {
  id: string;
  min: number;
  max: number;
  placeholder: string;
}

export const NumberInline = ({ id, min, max, placeholder }: NumberInlineProps): JSX.Element => (
  <NumberField id={id} min={min} max={max} placeholder={placeholder} inline={true} />
);
