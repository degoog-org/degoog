import { ExtField } from "./ext-field";
import { basenameOf } from "./field-widgets";
import { FileUploadWidget } from "../../../utils/file-upload-widget";
import type { Child } from "../../../../shared/ui/core/types";
import type { SettingField } from "../../../types";

const t = window.scopedT("core");

export interface FileFieldProps {
  field: SettingField;
  value: string;
  desc?: Child;
}

export const FileField = ({
  field,
  value,
  desc,
}: FileFieldProps): JSX.Element => {
  const hintParts: string[] = [];
  if (field.accept) hintParts.push(field.accept);
  if (field.maxSizeKb) hintParts.push(`≤ ${field.maxSizeKb} KB`);
  const hint = hintParts.join(" · ") || undefined;

  return (
    <ExtField
      fieldKey={field.key}
      type="file"
      extra={{
        "data-max-kb": field.maxSizeKb ? String(field.maxSizeKb) : undefined,
        "data-min-kb": field.minSizeKb ? String(field.minSizeKb) : undefined,
      }}
    >
      <label class="ext-field-label">{field.label}</label>
      <input
        type="hidden"
        id={`field-${field.key}`}
        class="ext-field-file-value"
        value={value}
      />
      <FileUploadWidget
        inputId={`file-input-${field.key}`}
        accept={field.accept}
        buttonLabel={t("settings-page.modal.field-choose-file")}
        dropLabel={t("settings-page.modal.field-drop-hint")}
        hint={hint}
        currentName={value ? basenameOf(value) : undefined}
      />
      <p class="ext-field-file-status" hidden={true}></p>
      {desc}
    </ExtField>
  );
};
