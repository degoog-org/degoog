import type { FieldOption } from "../../../../shared/field-options";

export const OptionsSelectOption = ({
  option,
  selected,
}: {
  option: FieldOption;
  selected: boolean;
}): JSX.Element => (
  <option value={option.value} selected={selected}>
    {option.label ?? option.value}
  </option>
);
