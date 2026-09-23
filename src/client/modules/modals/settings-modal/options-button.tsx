import type { SettingField } from "../../../../shared/setting-field";

const t = window.scopedT("core");

export const OPTIONS_BTN_CLASS = "ext-field-options-btn";

export const OptionsButton = ({ field }: { field: SettingField }): JSX.Element | null => {
  const source = field.optionsFrom;
  if (!source) return null;
  return (
    <button
      type="button"
      class={OPTIONS_BTN_CLASS}
      data-options-key={field.key}
      data-options-depends={(source.dependsOn ?? []).join(",")}
      data-options-auto={source.auto ? "true" : undefined}
    >
      {source.refreshLabel || t("settings-page.modal.field-fetch")}
    </button>
  );
};
