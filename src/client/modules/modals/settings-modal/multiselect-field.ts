import { escapeHtml } from "../../../utils/dom";
import { parseTypeList } from "../../../../shared/search-types";
import type { SettingField, ExtensionMeta } from "../../../types";

const FIELD_CLASS = "ext-field-multiselect";
const CHIP_CLASS = "ext-field-multiselect-chip";
const VALUE_CLASS = "ext-field-multiselect-value";
const CHIP_ON_CLASS = "ext-field-multiselect-chip--on";

const _chosen = (field: SettingField, ext: ExtensionMeta): string[] => {
  const stored = ext.settings[field.key];
  const picked = parseTypeList(stored);
  return picked.length > 0 ? picked : parseTypeList(field.default);
};

export const renderMultiField = (
  field: SettingField,
  ext: ExtensionMeta,
  descHtml: string,
): string => {
  const options = field.options ?? [];
  const picked = new Set(_chosen(field, ext));
  const chips = options
    .map((value, at) => {
      const label = field.optionLabels?.[at] ?? value;
      const on = picked.has(value);
      return `<button type="button" class="${CHIP_CLASS}${on ? ` ${CHIP_ON_CLASS}` : ""}" data-value="${escapeHtml(value)}" aria-pressed="${on}">${escapeHtml(label)}</button>`;
    })
    .join("");
  const initial = options.filter((value) => picked.has(value));
  return `<div class="ext-field" data-key="${escapeHtml(field.key)}" data-type="multiselect">
      <label class="ext-field-label">${escapeHtml(field.label)}</label>
      <div class="${FIELD_CLASS}" role="group" aria-label="${escapeHtml(field.label)}">${chips}</div>
      <input type="hidden" id="field-${escapeHtml(field.key)}" class="${VALUE_CLASS}" value="${escapeHtml(initial.join(","))}">
      ${descHtml}
    </div>`;
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
