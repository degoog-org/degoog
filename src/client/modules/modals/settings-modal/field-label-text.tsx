import type { SettingField } from "../../../types";

export const FieldLabelText = ({ field }: { field: SettingField }): JSX.Element => (
  <>
    {field.label}
    {field.required ? <> <span class="ext-required">*</span></> : null}
  </>
);
