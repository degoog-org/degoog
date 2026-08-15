import { getBase } from "../../../utils/base-url";
import { getStoredToken } from "../../settings/settings";
import { jsonHeaders } from "../../../utils/request";
import { escapeHtml } from "../../../utils/dom";
import type { FieldOption, SettingField } from "../../../types";

const t = window.scopedT("core");

const OPTIONS_ROW_CLASS = "ext-field-options-row";
const OPTIONS_BTN_CLASS = "ext-field-options-btn";
const OPTIONS_STATUS_CLASS = "ext-field-options-status";
const OPTIONS_LIST_CLASS = "ext-field-options-list";
const OPTIONS_ITEM_CLASS = "ext-field-options-item";
const MAX_VISIBLE_OPTIONS = 50;

export const renderOptionsButton = (field: SettingField): string => {
  const source = field.optionsFrom;
  if (!source) return "";
  const label = source.refreshLabel || t("settings-page.modal.field-fetch");
  const depends = (source.dependsOn ?? []).join(",");
  return `<button type="button" class="${OPTIONS_BTN_CLASS}" data-options-key="${escapeHtml(field.key)}" data-options-depends="${escapeHtml(depends)}"${source.auto ? ' data-options-auto="true"' : ""}>${escapeHtml(label)}</button>`;
};

export const wrapOptionsRow = (field: SettingField, inner: string): string => {
  if (!field.optionsFrom) return inner;
  const hint = field.optionsFrom.emptyHint
    ? escapeHtml(field.optionsFrom.emptyHint)
    : "";
  return `<div class="${OPTIONS_ROW_CLASS}">${inner}${renderOptionsButton(field)}</div>
    <p class="${OPTIONS_STATUS_CLASS}"${hint ? "" : " hidden"}>${hint}</p>`;
};

export const renderOptionsList = (field: SettingField): string =>
  field.optionsFrom
    ? `<ul class="${OPTIONS_LIST_CLASS}" hidden></ul>`
    : "";

const _fillSelect = (
  select: HTMLSelectElement,
  options: FieldOption[],
  chosen: string,
): void => {
  const previous = select.value;
  const wanted = chosen || previous;
  select.innerHTML = options
    .map((opt) => {
      const label = opt.label ?? opt.value;
      const selected = opt.value === wanted ? " selected" : "";
      return `<option value="${escapeHtml(opt.value)}"${selected}>${escapeHtml(label)}</option>`;
    })
    .join("");
  if (options.some((opt) => opt.value === wanted)) select.value = wanted;
};

const _matching = (options: FieldOption[], typed: string): FieldOption[] => {
  const needle = typed.trim().toLowerCase();
  if (!needle) return options.slice(0, MAX_VISIBLE_OPTIONS);
  return options
    .filter((opt) => {
      const hay = `${opt.value} ${opt.label ?? ""}`.toLowerCase();
      return hay.includes(needle);
    })
    .slice(0, MAX_VISIBLE_OPTIONS);
};

const _paintList = (
  list: HTMLElement,
  options: FieldOption[],
  typed: string,
): void => {
  const shown = _matching(options, typed);
  list.innerHTML = shown
    .map((opt) => {
      const detail =
        opt.label && opt.label !== opt.value
          ? `<span class="ext-field-options-detail">${escapeHtml(opt.label)}</span>`
          : "";
      return `<li><button type="button" class="${OPTIONS_ITEM_CLASS}" data-value="${escapeHtml(opt.value)}">${escapeHtml(opt.value)}${detail}</button></li>`;
    })
    .join("");
  list.hidden = shown.length === 0;
};

const _bindCombobox = (
  fieldEl: HTMLElement,
  input: HTMLInputElement,
  list: HTMLElement,
  readOptions: () => FieldOption[],
): void => {
  const close = (): void => {
    list.hidden = true;
  };

  input.addEventListener("input", () => {
    const options = readOptions();
    if (options.length === 0) return;
    _paintList(list, options, input.value);
  });

  input.addEventListener("focus", () => {
    const options = readOptions();
    if (options.length > 0) _paintList(list, options, input.value);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !list.hidden) {
      event.stopPropagation();
      close();
    }
  });

  list.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLElement>(
      `.${OPTIONS_ITEM_CLASS}`,
    );
    if (!btn) return;
    input.value = btn.dataset.value ?? "";
    close();
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  document.addEventListener("click", (event) => {
    if (!fieldEl.contains(event.target as Node)) close();
  });
};

const _dependenciesReady = (
  values: Record<string, string | string[]>,
  depends: string[],
): boolean =>
  depends.every((key) => {
    const value = values[key];
    return Array.isArray(value) ? value.length > 0 : (value ?? "") !== "";
  });

export const initOptionsFields = (
  container: HTMLElement,
  extId: string,
  collectValues: () => Record<string, string | string[]>,
): void => {
  container
    .querySelectorAll<HTMLButtonElement>(`.${OPTIONS_BTN_CLASS}`)
    .forEach((btn) => {
      const key = btn.dataset.optionsKey;
      if (!key) return;
      const fieldEl = btn.closest<HTMLElement>(".ext-field");
      const status = fieldEl?.querySelector<HTMLElement>(
        `.${OPTIONS_STATUS_CLASS}`,
      );

      const setStatus = (text: string): void => {
        if (!status) return;
        status.textContent = text;
        status.hidden = text === "";
      };

      const list = fieldEl?.querySelector<HTMLElement>(`.${OPTIONS_LIST_CLASS}`);
      const input = fieldEl?.querySelector<HTMLInputElement>("input");
      let loaded: FieldOption[] = [];
      if (fieldEl && list && input) {
        _bindCombobox(fieldEl, input, list, () => loaded);
      }

      const load = async (): Promise<void> => {
        btn.disabled = true;
        setStatus(t("settings-page.modal.field-fetching"));
        try {
          const res = await fetch(
            `${getBase()}/api/extensions/${encodeURIComponent(extId)}/options/${encodeURIComponent(key)}`,
            {
              method: "POST",
              headers: jsonHeaders(getStoredToken),
              body: JSON.stringify(collectValues()),
            },
          );
          const data = (await res.json().catch(() => null)) as {
            options?: FieldOption[];
            notice?: string;
            value?: string;
          } | null;
          if (!res.ok || !data) {
            setStatus(t("settings-page.modal.field-fetch-failed"));
            return;
          }
          const options = data.options ?? [];
          const chosen = data.value ?? "";
          const select = fieldEl?.querySelector<HTMLSelectElement>("select");
          if (select) {
            _fillSelect(select, options, chosen);
            select.dispatchEvent(new Event("change", { bubbles: true }));
          }
          loaded = options;
          if (input && chosen) input.value = chosen;
          if (list && input) _paintList(list, options, "");
          setStatus(
            data.notice ||
              (options.length === 0
                ? t("settings-page.modal.field-fetch-empty")
                : ""),
          );
        } catch {
          setStatus(t("settings-page.modal.field-fetch-failed"));
        } finally {
          btn.disabled = false;
        }
      };

      btn.addEventListener("click", () => void load());

      const depends = (btn.dataset.optionsDepends || "")
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);
      if (
        btn.dataset.optionsAuto === "true" &&
        _dependenciesReady(collectValues(), depends)
      ) {
        void load();
      }
    });
};
