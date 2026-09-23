import type { FieldOption } from "../../../../shared/field-options";

export const OPTIONS_ITEM_CLASS = "ext-field-options-item";

export const OptionsListItem = ({ option }: { option: FieldOption }): JSX.Element => (
  <li>
    <button type="button" class={OPTIONS_ITEM_CLASS} data-value={option.value}>
      {option.value}
      {option.label && option.label !== option.value ? (
        <span class="ext-field-options-detail">{option.label}</span>
      ) : null}
    </button>
  </li>
);
