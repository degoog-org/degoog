import { OptionsButton } from "./options-button";
import type { Child } from "../../../../shared/ui/core/types";
import type { SettingField } from "../../../types";

export const OPTIONS_ROW_CLASS = "ext-field-options-row";
export const OPTIONS_STATUS_CLASS = "ext-field-options-status";

export const OptionsRow = ({
  field,
  children,
}: {
  field: SettingField;
  children?: Child;
}): JSX.Element => {
  const hint = field.optionsFrom?.emptyHint ?? "";
  return (
    <>
      <div class={OPTIONS_ROW_CLASS}>
        {children}
        <OptionsButton field={field} />
      </div>
      <p class={OPTIONS_STATUS_CLASS} hidden={!hint}>
        {hint}
      </p>
    </>
  );
};
