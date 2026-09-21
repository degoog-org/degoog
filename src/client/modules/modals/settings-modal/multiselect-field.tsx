import { renderHtml } from "../../../../shared/ui/core/html";
import { raw } from "../../../../shared/ui/core/raw";
import { parseTypeList } from "../../../../shared/search-types";
import type { SettingField, ExtensionMeta } from "../../../types";

const FIELD_CLASS = "ext-field-multiselect";
const CHIP_CLASS = "ext-field-multiselect-chip";
const VALUE_CLASS = "ext-field-multiselect-value";
const CHIP_ON_CLASS = "ext-field-multiselect-chip--on";

const _chosen = (field: SettingField, ext: ExtensionMeta): string[] => {
  const stored = ext.settings[field.key];
  return parseTypeList(stored === undefined ? field.default : stored);
};

export const renderMultiField = (
  field: SettingField,
  ext: ExtensionMeta,
  descHtml: string,
): string => {
  const options = field.options ?? [];
  const picked = new Set(_chosen(field, ext));
  const initial = options.filter((value) => picked.has(value));

  return renderHtml(
    <div class="ext-field" data-key={field.key} data-type="multiselect">
      <label class="ext-field-label">{field.label}</label>
      <div class={FIELD_CLASS} role="group" aria-label={field.label}>
        {options.map((value, at) => {
          const on = picked.has(value);
          return (
            <button
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
      {raw(descHtml)}
    </div>,
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

      fieldEl.querySelectorAll<HTMLElement>(`.${CHIP_CLASS}`).forEach((chip) => {
        chip.addEventListener("click", () => {
          const on = chip.classList.toggle(CHIP_ON_CLASS);
          chip.setAttribute("aria-pressed", String(on));
          sync();
        });
      });
    });
};
