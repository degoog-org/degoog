import { Raw } from "../../../../shared/ui/core/raw";
import { SubLabel } from "./list-sub-label";
import { renderMdInline } from "../../../utils/md";
import type { SettingField } from "../../../types";

export const ListInfoSub = ({ sub }: { sub: SettingField }): JSX.Element => {
  const hasValue = sub.default != null && sub.default !== "";
  return (
    <label class="ext-list-sub">
      <SubLabel label={sub.label} />
      {hasValue ? (
        <input
          class="ext-field-input degoog-input"
          type="text"
          value={sub.default ?? ""}
          disabled={true}
        />
      ) : null}
      {sub.description ? (
        <span class="ext-field-desc">
          <Raw html={renderMdInline(sub.description)} />
        </span>
      ) : null}
    </label>
  );
};
