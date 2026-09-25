import { ListSubField } from "./list-sub-field";
import { rowSummary, type ListRow } from "./list-field-data";
import type { SettingField } from "../../../../../shared/setting-field";

const t = window.scopedT("core");

export const ListFieldRow = ({
  row,
  itemSchema,
}: {
  row: ListRow;
  itemSchema: SettingField[];
}): JSX.Element => {
  const reorder = t("settings-page.extensions.drag-to-reorder");
  return (
    <div class="ext-list-row">
      <div class="ext-list-row-head">
        <span
          class="degoog-drag-handle ext-list-row-drag"
          data-drag-handle={true}
          tabindex="0"
          role="button"
          title={reorder}
          aria-label={reorder}
        >
          <i class="fa-solid fa-grip-vertical"></i>
        </span>
        <span class="ext-list-row-summary">{rowSummary(row, itemSchema)}</span>
        <button
          type="button"
          class="ext-list-row-edit"
          aria-label={t("settings-page.modal.field-edit-aria")}
        >
          ✎
        </button>
        <button
          type="button"
          class="ext-list-row-remove"
          aria-label={t("settings-page.modal.field-remove-aria")}
        >
          ×
        </button>
      </div>
      <div class="ext-list-row-editor" hidden={true}>
        {itemSchema.map((sub) => (
          <ListSubField key={sub.key} sub={sub} row={row} />
        ))}
      </div>
    </div>
  );
};
