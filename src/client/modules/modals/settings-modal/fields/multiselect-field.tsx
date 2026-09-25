import { ExtField } from "./ext-field";
import { parseTypeList } from "../../../../../shared/search-types";
import type { Child } from "../../../../../shared/ui/tribute/types";
import type { ExtensionMeta } from "../../../../types/extension";
import type { SettingField } from "../../../../../shared/setting-field";

const FIELD_CLASS = "ext-field-multiselect";
const CHIP_CLASS = "ext-field-multiselect-chip";
const VALUE_CLASS = "ext-field-multiselect-value";
const CHIP_ON_CLASS = "ext-field-multiselect-chip--on";

const _chosen = (field: SettingField, ext: ExtensionMeta): string[] => {
  const stored = ext.settings[field.key];
  return parseTypeList(stored === undefined ? field.default : stored);
};

export interface MultiselectFieldProps {
  field: SettingField;
  ext: ExtensionMeta;
  desc?: Child;
}

export const MultiselectField = ({
  field,
  ext,
  desc,
}: MultiselectFieldProps): JSX.Element => {
  const options = field.options ?? [];
  const picked = new Set(_chosen(field, ext));
  const initial = options.filter((value) => picked.has(value));

  return (
    <ExtField fieldKey={field.key} type="multiselect">
      <label class="ext-field-label">{field.label}</label>
      <div class={FIELD_CLASS} role="group" aria-label={field.label}>
        {options.map((value, at) => {
          const on = picked.has(value);
          return (
            <button
              key={value}
              type="button"
              class={on ? `${CHIP_CLASS} ${CHIP_ON_CLASS}` : CHIP_CLASS}
              data-value={value}
              aria-pressed={String(on)}
            >
              {field.optionLabels?.[at] ?? value}
            </button>
          );
        })}
      </div>
      <input
        type="hidden"
        id={`field-${field.key}`}
        class={VALUE_CLASS}
        value={initial.join(",")}
      />
      {desc}
    </ExtField>
  );
};

export const initMultiFields = (container: HTMLElement): void => {
  container
    .querySelectorAll<HTMLElement>(".ext-field[data-type='multiselect']")
    .forEach((fieldEl) => {
      const hidden = fieldEl.querySelector<HTMLInputElement>(`.${VALUE_CLASS}`);
      if (!hidden) return;

      const sync = (): void => {
        const on = [
          ...fieldEl.querySelectorAll<HTMLElement>(`.${CHIP_ON_CLASS}`),
        ].map((chip) => chip.dataset.value ?? "");
        hidden.value = on.filter(Boolean).join(",");
        hidden.dispatchEvent(new Event("change", { bubbles: true }));
      };

      fieldEl
        .querySelectorAll<HTMLElement>(`.${CHIP_CLASS}`)
        .forEach((chip) => {
          chip.addEventListener("click", () => {
            const on = chip.classList.toggle(CHIP_ON_CLASS);
            chip.setAttribute("aria-pressed", String(on));
            sync();
          });
        });
    });
};
