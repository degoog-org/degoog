export interface NumberFieldProps {
  id: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  inline?: boolean;
}

export const NumberField = ({
  id,
  min,
  max,
  step,
  placeholder,
  inline,
}: NumberFieldProps): JSX.Element => (
  <input
    type="number"
    id={id}
    class={
      inline
        ? "settings-rate-limit-input settings-rate-limit-input--inline degoog-input"
        : "settings-rate-limit-input degoog-input"
    }
    min={min}
    max={max}
    step={step}
    placeholder={placeholder}
  />
);
