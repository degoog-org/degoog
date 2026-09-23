import type { SettingField } from "../../../../shared/setting-field";

export const FieldLabelText = ({ field }: { field: SettingField }): JSX.Element => (
  <>
    {field.label}
    {field.required ? <> <span class="ext-required">*</span></> : null}
  </>
);
