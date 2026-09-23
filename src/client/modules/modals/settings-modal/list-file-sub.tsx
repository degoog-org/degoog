import { SubLabel } from "./list-sub-label";
import { basenameOf } from "./field-widgets";
import { FileUploadWidget } from "../../../utils/file-upload-widget";
import type { SettingField } from "../../../../shared/setting-field";

const t = window.scopedT("core");

export const ListFileSub = ({
  sub,
  value,
}: {
  sub: SettingField;
  value: string;
}): JSX.Element => {
  const hintParts: string[] = [];
  if (sub.accept) hintParts.push(sub.accept);
  if (sub.maxSizeKb) hintParts.push(`≤ ${sub.maxSizeKb} KB`);
  return (
    <div
      class="ext-list-sub ext-list-sub--file"
      data-max-kb={sub.maxSizeKb ? String(sub.maxSizeKb) : undefined}
      data-min-kb={sub.minSizeKb ? String(sub.minSizeKb) : undefined}
    >
      <SubLabel label={sub.label} />
      <input
        type="hidden"
        class="ext-list-subfield ext-list-file-value"
        data-subkey={sub.key}
        data-subtype="text"
        value={value}
      />
      <FileUploadWidget
        inputId={`file-list-${sub.key}-${Math.random().toString(36).slice(2, 8)}`}
        accept={sub.accept}
        buttonLabel={t("settings-page.modal.field-choose-file")}
        dropLabel={t("settings-page.modal.field-drop-hint")}
        hint={hintParts.join(" · ") || undefined}
        currentName={value ? basenameOf(value) : undefined}
      />
      <p class="ext-list-file-status" hidden={true}></p>
    </div>
  );
};
