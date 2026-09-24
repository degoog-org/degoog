import { fieldDesc } from "./fields/field-desc";
import { ConditionalField } from "./fields/conditional-field";
import { ExtField } from "./fields/ext-field";
import { FieldLabelText } from "./fields/field-label-text";
import { ListField } from "./list-field/list-field";
import { UrlListField } from "./fields/url-list-field";
import { HexField } from "./fields/hex-field";
import { RangeField } from "./fields/range-field";
import { FileField } from "./fields/file-field";
import { optionsListFor, wrapOptionsRow } from "./options-field/options-field";
import { MultiselectField } from "./fields/multiselect-field";
import type { Child } from "../../../../shared/ui/tribute/types";
import type { ExtensionMeta } from "../../../types/extension";
import type { SettingField } from "../../../../shared/setting-field";

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
  inner: Child,
  ext: ExtensionMeta,
): Child => {
  const w = field.visibleWhen;
  if (!w) return inner;
  return (
    <ConditionalField
      depKey={w.key}
      equals={w.equals}
      show={_depMeetsSavedValue(ext, w.key, w.equals)}
    >
      {inner}
    </ConditionalField>
  );
};

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

export const renderField = (
  field: SettingField,
  currentValue: string,
  ext: ExtensionMeta,
): Child => {
  const isSecret = field.secret === true;
  const isSet = currentValue === "__SET__";
  const displayValue = isSecret ? "" : currentValue || "";
  const configuredClass =
    isSecret && isSet ? " ext-field-input--configured" : "";
  const placeholder = isSecret && isSet ? "••••••••" : field.placeholder || "";
  const desc = fieldDesc(field.description);

  if (field.type === "info") {
    const hasValue = field.default != null && field.default !== "";
    return (
      <ExtField fieldKey={field.key} type="info">
        <label class="ext-field-label">{field.label}</label>
        {hasValue ? (
          <input
            class="ext-field-input degoog-input"
            type="text"
            value={field.default ?? ""}
            disabled={true}
          />
        ) : null}
        {fieldDesc(field.description)}
      </ExtField>
    );
  }

  if (field.type === "urllist") {
    return _wrapVisibleWhen(
      field,
      <UrlListField field={field} ext={ext} />,
      ext,
    );
  }

  if (field.type === "list") {
    return _wrapVisibleWhen(field, <ListField field={field} ext={ext} />, ext);
  }

  if (field.type === "multiselect") {
    return _wrapVisibleWhen(
      field,
      <MultiselectField field={field} ext={ext} desc={desc} />,
      ext,
    );
  }

  if (field.type === "hex") {
    return _wrapVisibleWhen(
      field,
      <HexField field={field} value={displayValue} desc={desc} />,
      ext,
    );
  }

  if (field.type === "range") {
    return _wrapVisibleWhen(
      field,
      <RangeField field={field} value={displayValue} desc={desc} />,
      ext,
    );
  }

  if (field.type === "file") {
    return _wrapVisibleWhen(
      field,
      <FileField field={field} value={currentValue || ""} desc={desc} />,
      ext,
    );
  }

  if (field.type === "toggle") {
    return _wrapVisibleWhen(
      field,
      <ExtField fieldKey={field.key} type="toggle">
        <label class="ext-field-toggle-row">
          <span class="ext-field-label">{field.label}</span>
          <label class="engine-toggle degoog-toggle-wrap degoog-toggle-wrap--transparent">
            <input
              type="checkbox"
              id={`field-${field.key}`}
              checked={currentValue === "true"}
            />
            <span class="toggle-slider degoog-toggle"></span>
          </label>
        </label>
        {desc}
      </ExtField>,
      ext,
    );
  }

  if (field.type === "textarea") {
    return _wrapVisibleWhen(
      field,
      <ExtField
        fieldKey={field.key}
        type="textarea"
        extra={{
          "data-secret": String(isSecret),
          "data-was-set": String(isSet),
        }}
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
        {desc}
      </ExtField>,
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
    const control = (
      <div class="ext-field-select-wrap degoog-select-wrap">
        <select
          id={`field-${field.key}`}
          class="ext-field-input ext-field-select degoog-input"
        >
          {known.map((v) => {
            const at = declared.indexOf(v);
            const fallback =
              at >= 0 ? v.charAt(0).toUpperCase() + v.slice(1) : v;
            const label =
              (at >= 0 ? field.optionLabels?.[at] : undefined) ?? fallback;
            return (
              <option key={v} value={v} selected={validValue === v}>
                {label}
              </option>
            );
          })}
        </select>
      </div>
    );
    return _wrapVisibleWhen(
      field,
      <ExtField fieldKey={field.key} type="select">
        <label class="ext-field-label" for={`field-${field.key}`}>
          {field.label}
        </label>
        {wrapOptionsRow(field, control)}
        {desc}
      </ExtField>,
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
  const input = (
    <input
      class={`ext-field-input${configuredClass} degoog-input`}
      type={inputType}
      id={`field-${field.key}`}
      value={displayValue}
      placeholder={placeholder}
      autocomplete="off"
    />
  );
  return _wrapVisibleWhen(
    field,
    <ExtField
      fieldKey={field.key}
      type={field.type}
      extra={{
        "data-secret": String(isSecret),
        "data-was-set": String(isSet),
      }}
    >
      <label class="ext-field-label" for={`field-${field.key}`}>
        <FieldLabelText field={field} />
      </label>
      {wrapOptionsRow(field, input)}
      {optionsListFor(field)}
      {desc}
    </ExtField>,
    ext,
  );
};
