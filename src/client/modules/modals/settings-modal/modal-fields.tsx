import { renderFieldDesc } from "./field-desc";
import { renderHtml } from "../../../../shared/ui/core/html";
import { raw } from "../../../../shared/ui/core/raw";
import { renderListField } from "./list-field";
import {
  renderHexField,
  renderRangeField,
  renderFileField,
} from "./field-widgets";
import { renderOptionsList, wrapOptionsRow } from "./options-field";
import { renderMultiField } from "./multiselect-field";
import type { SettingField, ExtensionMeta } from "../../../types";

const t = window.scopedT("core");

const _depMeetsSavedValue = (
  ext: ExtensionMeta,
  depKey: string,
  equals: string,
): boolean => {
  const stored = ext.settings[depKey];
  let v: string;
  if (stored === undefined || stored === null) {
    const def = ext.settingsSchema.find((f) => f.key === depKey)?.default;
    v = def !== undefined && def !== null ? String(def) : "";
  } else {
    v = Array.isArray(stored) ? stored.join("\n") : String(stored);
  }
  if (equals === "true" || equals === "false") {
    const norm = v === "true" ? "true" : "false";
    return norm === equals;
  }
  return v === equals;
};

const _wrapVisibleWhen = (
  field: SettingField,
  inner: string,
  ext: ExtensionMeta,
): string => {
  const w = field.visibleWhen;
  if (!w) return inner;
  const show = _depMeetsSavedValue(ext, w.key, w.equals);
  return renderHtml(
    <div
      class="ext-conditional-field"
      hidden={!show}
      data-visible-dep-key={w.key}
      data-visible-dep-equals={w.equals}
    >
      {raw(inner)}
    </div>,
  );
};

const FieldLabelText = ({ field }: { field: SettingField }): JSX.Element => (
  <>
    {field.label}
    {field.required ? <> <span class="ext-required">*</span></> : null}
  </>
);

export function readLiveSettingFieldValue(
  container: HTMLElement,
  depKey: string,
): string {
  const escapedKey =
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(depKey)
      : depKey.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const fieldEl = container.querySelector<HTMLElement>(
    `.ext-field[data-key="${escapedKey}"]`,
  );
  if (!fieldEl) return "";
  const type = fieldEl.dataset.type;
  if (type === "toggle") {
    const input = fieldEl.querySelector<HTMLInputElement>(
      "input[type=checkbox]",
    );
    return input?.checked ? "true" : "false";
  }
  if (type === "select") {
    return fieldEl.querySelector<HTMLSelectElement>("select")?.value ?? "";
  }
  if (type === "urllist") {
    const hidden = fieldEl.querySelector<HTMLInputElement>(
      ".ext-field-urllist-value",
    );
    return hidden?.value?.trim() ?? "";
  }
  if (type === "list") {
    const hidden = fieldEl.querySelector<HTMLInputElement>(
      ".ext-field-list-value",
    );
    return hidden?.value?.trim() ?? "";
  }
  if (type === "multiselect") {
    const hidden = fieldEl.querySelector<HTMLInputElement>(
      ".ext-field-multiselect-value",
    );
    return hidden?.value?.trim() ?? "";
  }
  if (type === "file") {
    const hidden = fieldEl.querySelector<HTMLInputElement>(
      ".ext-field-file-value",
    );
    return hidden?.value?.trim() ?? "";
  }
  const input =
    fieldEl.querySelector<HTMLTextAreaElement>("textarea") ||
    fieldEl.querySelector<HTMLInputElement>("input");
  return input?.value.trim() ?? "";
}

export function syncConditionalFields(container: HTMLElement): void {
  container
    .querySelectorAll<HTMLElement>(".ext-conditional-field")
    .forEach((wrapper) => {
      const depKey = wrapper.dataset.visibleDepKey;
      const equals = wrapper.dataset.visibleDepEquals;
      if (depKey === undefined || equals === undefined) return;
      const actual = readLiveSettingFieldValue(container, depKey);
      wrapper.hidden = actual !== equals;
    });
}

const _selectValues = (declared: string[], current: string): string[] =>
  current && !declared.includes(current) ? [...declared, current] : declared;

const _parseUrlListValue = (
  stored: string | string[] | undefined,
  defaultUrls: string[],
): string[] => {
  if (Array.isArray(stored)) {
    return stored.filter((u) => typeof u === "string" && u.startsWith("http"));
  }
  if (!stored || String(stored).trim() === "") return defaultUrls;
  try {
    const parsed = JSON.parse(String(stored)) as unknown;
    if (!Array.isArray(parsed)) return defaultUrls;
    return (parsed as unknown[]).filter(
      (u): u is string => typeof u === "string" && u.startsWith("http"),
    );
  } catch {
    return defaultUrls;
  }
};

const _renderUrlListField = (
  field: SettingField,
  ext: ExtensionMeta,
): string => {
  const defaultUrls = ext.defaultFeedUrls ?? [];
  const urls = _parseUrlListValue(
    ext.settings[field.key] as string | string[] | undefined,
    defaultUrls,
  );
  const descHtml = renderFieldDesc(field.description);
  return renderHtml(
    <div class="ext-field" data-key={field.key} data-type="urllist">
      <label class="ext-field-label">{field.label}</label>
      <ul class="ext-field-urllist">
        {urls.map((url) => (
          <li class="ext-field-urllist-item" data-url={url}>
            <span class="ext-field-urllist-url">{url}</span>
            <button
              type="button"
              class="ext-field-urllist-remove"
              aria-label={t("settings-page.modal.field-remove-aria")}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div class="ext-field-urllist-add">
        <input
          type="url"
          class="ext-field-input ext-field-urllist-input degoog-input"
          placeholder={field.placeholder || "https://example.com/feed.xml"}
          autocomplete="off"
        />
        <button type="button" class="ext-field-urllist-add-btn">
          {t("settings-page.modal.field-add")}
        </button>
      </div>
      <input type="hidden" id={`field-${field.key}`} class="ext-field-urllist-value" />
      {raw(descHtml)}
    </div>,
  );
};

export function initUrlList(container: HTMLElement): void {
  const field = container.querySelector<HTMLElement>(
    ".ext-field[data-type='urllist']",
  );
  if (!field) return;
  const listEl = field.querySelector<HTMLElement>(".ext-field-urllist");
  const addInput = field.querySelector<HTMLInputElement>(
    ".ext-field-urllist-input",
  );
  const addBtn = field.querySelector<HTMLElement>(".ext-field-urllist-add-btn");
  const hiddenInput = field.querySelector<HTMLInputElement>(
    ".ext-field-urllist-value",
  );
  if (!listEl || !addInput || !addBtn || !hiddenInput) return;

  const initialUrls = [
    ...listEl.querySelectorAll<HTMLElement>(".ext-field-urllist-item"),
  ]
    .map((li) => li.dataset.url || "")
    .filter(Boolean);
  hiddenInput.value = JSON.stringify(initialUrls);

  const getUrls = (): string[] => {
    try {
      const parsed = JSON.parse(hiddenInput?.value || "[]") as unknown;
      return Array.isArray(parsed)
        ? (parsed as unknown[]).filter(
          (u): u is string => typeof u === "string",
        )
        : [];
    } catch {
      return [];
    }
  };

  function setUrls(urls: string[]): void {
    if (hiddenInput) hiddenInput.value = JSON.stringify(urls);
  }

  function addUrl(url: string): void {
    const trimmed = url.trim();
    if (!trimmed.startsWith("http")) return;
    try {
      new URL(trimmed);
    } catch {
      return;
    }
    const urls = getUrls();
    if (urls.includes(trimmed)) return;
    urls.push(trimmed);
    setUrls(urls);
    const li = document.createElement("li");
    li.className = "ext-field-urllist-item";
    li.dataset.url = trimmed;
    li.innerHTML = renderHtml(
      <>
        <span class="ext-field-urllist-url">{trimmed}</span>
        <button
          type="button"
          class="ext-field-urllist-remove"
          aria-label={t("settings-page.modal.field-remove-aria")}
        >
          ×
        </button>
      </>,
    );
    li.querySelector(".ext-field-urllist-remove")?.addEventListener(
      "click",
      () => {
        setUrls(getUrls().filter((x) => x !== trimmed));
        li.remove();
      },
    );
    listEl?.appendChild(li);
  }

  field
    .querySelectorAll<HTMLElement>(".ext-field-urllist-remove")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const li = btn.closest<HTMLElement>(".ext-field-urllist-item");
        const url = li?.dataset?.url;
        if (!url) return;
        setUrls(getUrls().filter((u) => u !== url));
        li?.remove();
      });
    });

  addBtn.addEventListener("click", () => {
    if (addInput.value) {
      addUrl(addInput.value);
      addInput.value = "";
    }
  });
  addInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (addInput.value) {
        addUrl(addInput.value);
        addInput.value = "";
      }
    }
  });
}

export const renderField = (
  field: SettingField,
  currentValue: string,
  ext: ExtensionMeta,
): string => {
  const isSecret = field.secret === true;
  const isSet = currentValue === "__SET__";
  const displayValue = isSecret ? "" : currentValue || "";
  const configuredClass =
    isSecret && isSet ? " ext-field-input--configured" : "";
  const placeholder = isSecret && isSet ? "••••••••" : field.placeholder || "";
  const descHtml = renderFieldDesc(field.description);

  if (field.type === "info") {
    const descriptionHtml = renderFieldDesc(field.description);
    const hasValue = field.default != null && field.default !== "";
    return renderHtml(
      <div class="ext-field" data-key={field.key} data-type="info">
        <label class="ext-field-label">{field.label}</label>
        {hasValue ? (
          <input
            class="ext-field-input degoog-input"
            type="text"
            value={field.default ?? ""}
            disabled={true}
          />
        ) : null}
        {raw(descriptionHtml)}
      </div>,
    );
  }

  if (field.type === "urllist") {
    return _wrapVisibleWhen(field, _renderUrlListField(field, ext), ext);
  }

  if (field.type === "list") {
    return _wrapVisibleWhen(field, renderListField(field, ext), ext);
  }

  if (field.type === "multiselect") {
    return _wrapVisibleWhen(field, renderMultiField(field, ext, descHtml), ext);
  }

  if (field.type === "hex") {
    return _wrapVisibleWhen(
      field,
      renderHexField(field, displayValue, descHtml),
      ext,
    );
  }

  if (field.type === "range") {
    return _wrapVisibleWhen(
      field,
      renderRangeField(field, displayValue, descHtml),
      ext,
    );
  }

  if (field.type === "file") {
    return _wrapVisibleWhen(
      field,
      renderFileField(field, currentValue || "", descHtml),
      ext,
    );
  }

  if (field.type === "toggle") {
    return _wrapVisibleWhen(
      field,
      renderHtml(
        <div class="ext-field" data-key={field.key} data-type="toggle">
          <label class="ext-field-toggle-row">
            <span class="ext-field-label">{field.label}</span>
            <label class="engine-toggle degoog-toggle-wrap degoog-toggle-wrap--transparent">
              <input type="checkbox" id={`field-${field.key}`} checked={currentValue === "true"} />
              <span class="toggle-slider degoog-toggle"></span>
            </label>
          </label>
          {raw(descHtml)}
        </div>,
      ),
      ext,
    );
  }

  if (field.type === "textarea") {
    return _wrapVisibleWhen(
      field,
      renderHtml(
        <div
          class="ext-field"
          data-key={field.key}
          data-type="textarea"
          data-secret={String(isSecret)}
          data-was-set={String(isSet)}
        >
          <label class="ext-field-label" for={`field-${field.key}`}>
            <FieldLabelText field={field} />
          </label>
          <textarea
            class={`ext-field-input ext-field-textarea${configuredClass} degoog-input`}
            id={`field-${field.key}`}
            placeholder={placeholder}
            rows={6}
            autocomplete="off"
          >
            {displayValue}
          </textarea>
          {raw(descHtml)}
        </div>,
      ),
      ext,
    );
  }

  if (
    field.type === "select" &&
    (field.optionsFrom ||
      (Array.isArray(field.options) && field.options.length > 0))
  ) {
    const declared = field.options ?? [];
    const known = _selectValues(declared, currentValue);
    const validValue = known.includes(currentValue) ? currentValue : known[0];
    const control = renderHtml(
      <div class="ext-field-select-wrap degoog-select-wrap">
        <select id={`field-${field.key}`} class="ext-field-input ext-field-select degoog-input">
          {known.map((v) => {
            const at = declared.indexOf(v);
            const fallback = at >= 0 ? v.charAt(0).toUpperCase() + v.slice(1) : v;
            const label = (at >= 0 ? field.optionLabels?.[at] : undefined) ?? fallback;
            return (
              <option value={v} selected={validValue === v}>
                {label}
              </option>
            );
          })}
        </select>
      </div>,
    );
    return _wrapVisibleWhen(
      field,
      renderHtml(
        <div class="ext-field" data-key={field.key} data-type="select">
          <label class="ext-field-label" for={`field-${field.key}`}>
            {field.label}
          </label>
          {raw(wrapOptionsRow(field, control))}
          {raw(descHtml)}
        </div>,
      ),
      ext,
    );
  }

  const inputType =
    field.type === "password"
      ? "password"
      : field.type === "url"
        ? "url"
        : field.type === "number"
          ? "number"
          : "text";
  const input = renderHtml(
    <input
      class={`ext-field-input${configuredClass} degoog-input`}
      type={inputType}
      id={`field-${field.key}`}
      value={displayValue}
      placeholder={placeholder}
      autocomplete="off"
    />,
  );
  return _wrapVisibleWhen(
    field,
    renderHtml(
      <div
        class="ext-field"
        data-key={field.key}
        data-type={field.type}
        data-secret={String(isSecret)}
        data-was-set={String(isSet)}
      >
        <label class="ext-field-label" for={`field-${field.key}`}>
          <FieldLabelText field={field} />
        </label>
        {raw(wrapOptionsRow(field, input))}
        {raw(renderOptionsList(field))}
        {raw(descHtml)}
      </div>,
    ),
    ext,
  );
};
