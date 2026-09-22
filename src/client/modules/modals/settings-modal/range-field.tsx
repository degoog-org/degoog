import { ExtField } from "./ext-field";
import type { Child } from "../../../../shared/ui/tribute/types";
import type { SettingField } from "../../../types";

export interface RangeFieldProps {
  field: SettingField;
  value: string;
  desc?: Child;
}

export const RangeField = ({
  field,
  value,
  desc,
}: RangeFieldProps): JSX.Element => {
  const min = field.min ?? "0";
  const max = field.max ?? "100";
  const step = field.step ?? "1";
  const current = value !== "" ? value : (field.default ?? min);
  return (
    <ExtField fieldKey={field.key} type="range">
      <label
        class="ext-field-label ext-field-range-label"
        for={`field-${field.key}`}
      >
        <span>{field.label}</span>
        <output class="ext-field-range-value">{current}</output>
      </label>
      <input
        class="ext-field-range"
        type="range"
        id={`field-${field.key}`}
        min={min}
        max={max}
        step={step}
        value={current}
      />
      {desc}
    </ExtField>
  );
};
