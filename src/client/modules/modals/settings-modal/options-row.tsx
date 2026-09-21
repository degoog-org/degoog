import { Raw } from "../../../../shared/ui/core/raw";
import { OptionsButton } from "./options-button";
import type { SettingField } from "../../../types";

export const OPTIONS_ROW_CLASS = "ext-field-options-row";
export const OPTIONS_STATUS_CLASS = "ext-field-options-status";

export const OptionsRow = ({
  field,
  innerHtml,
}: {
  field: SettingField;
  innerHtml: string;
}): JSX.Element => {
  const hint = field.optionsFrom?.emptyHint ?? "";
  return (
    <>
      <div class={OPTIONS_ROW_CLASS}>
        <Raw html={innerHtml} />
        <OptionsButton field={field} />
      </div>
      <p class={OPTIONS_STATUS_CLASS} hidden={!hint}>
        {hint}
      </p>
    </>
  );
};
