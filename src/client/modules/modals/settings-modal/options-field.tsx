import { getBase } from "../../../utils/base-url";
import { getStoredToken } from "../../settings/settings";
import { jsonHeaders } from "../../../utils/request";
import { render } from "../../../../shared/ui/tribute/dom";
import { OPTIONS_BTN_CLASS } from "./options-button";
import { OptionsList, OPTIONS_LIST_CLASS } from "./options-list";
import { OptionsListItem, OPTIONS_ITEM_CLASS } from "./options-list-item";
import { OptionsRow, OPTIONS_STATUS_CLASS } from "./options-row";
import { OptionsSelectOption } from "./options-select-option";
import type { Child } from "../../../../shared/ui/tribute/types";
import type { FieldOption, SettingField } from "../../../types";
import { parseFieldOptionsResponse } from "./options-field-parse";

const t = window.scopedT("core");

const MAX_VISIBLE_OPTIONS = 50;

export const wrapOptionsRow = (field: SettingField, inner: Child): Child =>
  field.optionsFrom ? <OptionsRow field={field}>{inner}</OptionsRow> : inner;

export const optionsListFor = (field: SettingField): Child =>
  field.optionsFrom ? <OptionsList /> : null;

const _fillSelect = (
  select: HTMLSelectElement,
  options: FieldOption[],
  chosen: string,
): void => {
  const previous = select.value;
  const wanted = chosen || previous;
  render(
    <>
      {options.map((opt) => (
        <OptionsSelectOption
          key={opt.value}
          option={opt}
          selected={opt.value === wanted}
        />
      ))}
    </>,
    select,
  );
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
  render(
    <>
      {shown.map((opt) => (
        <OptionsListItem key={opt.value} option={opt} />
      ))}
    </>,
    list,
  );
  list.hidden = shown.length === 0;
};

const _bindCombobox = (
  fieldEl: HTMLElement,
  input: HTMLInputElement,
  list: HTMLElement,
  readOptions: () => FieldOption[],
  signal: AbortSignal,
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

  document.addEventListener(
    "click",
    (event) => {
      if (!fieldEl.contains(event.target as Node)) close();
    },
    { signal },
  );
};

const _dependenciesReady = (
  values: Record<string, string | string[]>,
  depends: string[],
): boolean =>
  depends.every((key) => {
    const value = values[key];
    return Array.isArray(value) ? value.length > 0 : (value ?? "") !== "";
  });

let optionsFieldsAbort: AbortController | null = null;

export const disposeOptionsFields = (): void => {
  optionsFieldsAbort?.abort();
  optionsFieldsAbort = null;
};

export const initOptionsFields = (
  container: HTMLElement,
  extId: string,
  collectValues: () => Record<string, string | string[]>,
): void => {
  disposeOptionsFields();
  const abort = new AbortController();
  optionsFieldsAbort = abort;

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

      const list = fieldEl?.querySelector<HTMLElement>(
        `.${OPTIONS_LIST_CLASS}`,
      );
      const input = fieldEl?.querySelector<HTMLInputElement>("input");
      let loaded: FieldOption[] = [];
      if (fieldEl && list && input) {
        _bindCombobox(fieldEl, input, list, () => loaded, abort.signal);
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
              signal: abort.signal,
            },
          );
          const raw: unknown = await res.json().catch(() => null);
          const data = parseFieldOptionsResponse(raw);
          if (!res.ok || !data) {
            setStatus(t("settings-page.modal.field-fetch-failed"));
            return;
          }
          const options = data.options;
          const chosen = data.value ?? "";
          const select = fieldEl?.querySelector<HTMLSelectElement>("select");
          if (select) {
            _fillSelect(select, options, chosen);
            select.dispatchEvent(new Event("change", { bubbles: true }));
          }
          loaded = options;
          if (input && chosen) {
            input.value = chosen;
            input.dispatchEvent(new Event("change", { bubbles: true }));
          }
          if (list && input) _paintList(list, options, "");
          setStatus(
            data.notice ||
              (options.length === 0
                ? t("settings-page.modal.field-fetch-empty")
                : ""),
          );
        } catch {
          if (!abort.signal.aborted) {
            setStatus(t("settings-page.modal.field-fetch-failed"));
          }
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
