import { escapeHtml } from "../../../utils/dom";
import { renderMdInline } from "../../../utils/md";
import { initDragOrder } from "../../../utils/drag-order";
import { renderFileUpload, initFileUpload } from "../../../utils/file-upload";
import {
  HEX_RE,
  DEFAULT_HEX,
  normalizeHex,
  basenameOf,
  uploadExtensionFile,
} from "./field-widgets";
import {
  isListToggle,
  isListDisplay,
  defaultListRow,
  parseListValue,
  serializeRows,
  rowSummary,
  type ListRow,
} from "./list-field-data";
import type { SettingField, ExtensionMeta } from "../../../types";

const t = window.scopedT("core");

const _renderToggle = (sub: SettingField, value: string): string => {
  const checked = value === "true" ? " checked" : "";
  return `<label class="ext-list-sub ext-list-sub--toggle">
      <span class="ext-list-sub-label">${escapeHtml(sub.label)}</span>
      <div class="engine-toggle degoog-toggle-wrap degoog-toggle-wrap--transparent">
        <input type="checkbox" class="ext-list-subfield" data-subkey="${escapeHtml(sub.key)}" data-subtype="toggle"${checked}>
        <span class="toggle-slider degoog-toggle"></span>
      </div>
    </label>`;
};

const _renderInfo = (sub: SettingField): string => {
  const desc = sub.description
    ? `<span class="ext-field-desc">${renderMdInline(sub.description)}</span>`
    : "";
  const hasValue = sub.default != null && sub.default !== "";
  const valueHtml = hasValue
    ? `<input class="ext-field-input degoog-input" type="text" value="${escapeHtml(sub.default ?? "")}" disabled>`
    : "";
  return `<label class="ext-list-sub">
      <span class="ext-list-sub-label">${escapeHtml(sub.label)}</span>
      ${valueHtml}
      ${desc}
    </label>`;
};

const _renderTextarea = (sub: SettingField, value: string): string => {
  return `<label class="ext-list-sub">
      <span class="ext-list-sub-label">${escapeHtml(sub.label)}</span>
      <textarea class="ext-field-input ext-list-subfield degoog-input" data-subkey="${escapeHtml(sub.key)}" data-subtype="text" rows="2" placeholder="${escapeHtml(sub.placeholder || "")}" autocomplete="off">${escapeHtml(value)}</textarea>
    </label>`;
};

const _renderSelect = (sub: SettingField, value: string): string => {
  const options = sub.options ?? [];
  const selected = options.includes(value) ? value : (options[0] ?? "");
  const opts = options
    .map((opt, i) => {
      const optLabel = sub.optionLabels?.[i] ?? opt;
      return `<option value="${escapeHtml(opt)}"${opt === selected ? " selected" : ""}>${escapeHtml(optLabel)}</option>`;
    })
    .join("");
  return `<label class="ext-list-sub">
      <span class="ext-list-sub-label">${escapeHtml(sub.label)}</span>
      <div class="ext-field-select-wrap degoog-select-wrap">
        <select class="ext-field-input ext-list-subfield ext-field-select degoog-input" data-subkey="${escapeHtml(sub.key)}" data-subtype="text">${opts}</select>
      </div>
    </label>`;
};

const _inputTypeFor = (type: SettingField["type"]): string => {
  if (type === "url") return "url";
  if (type === "number") return "number";
  if (type === "password") return "password";
  return "text";
};

const _renderInput = (sub: SettingField, value: string): string => {
  const inputType = _inputTypeFor(sub.type);
  return `<label class="ext-list-sub">
      <span class="ext-list-sub-label">${escapeHtml(sub.label)}</span>
      <input class="ext-field-input ext-list-subfield degoog-input" type="${inputType}" data-subkey="${escapeHtml(sub.key)}" data-subtype="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(sub.placeholder || "")}" autocomplete="off">
    </label>`;
};

const _renderHex = (sub: SettingField, value: string): string => {
  const hex = value && HEX_RE.test(value) ? value : (sub.default || DEFAULT_HEX);
  return `<div class="ext-list-sub">
      <span class="ext-list-sub-label">${escapeHtml(sub.label)}</span>
      <div class="ext-field-hex">
        <input class="ext-field-input ext-list-subfield ext-list-hex-text degoog-input" type="text" data-subkey="${escapeHtml(sub.key)}" data-subtype="text" value="${escapeHtml(hex)}" placeholder="${escapeHtml(sub.placeholder || DEFAULT_HEX)}" autocomplete="off">
        <input class="ext-field-hex-color ext-list-hex-color" type="color" value="${escapeHtml(normalizeHex(hex))}" aria-label="${escapeHtml(sub.label)}">
      </div>
    </div>`;
};

const _renderRange = (sub: SettingField, value: string): string => {
  const min = sub.min ?? "0";
  const max = sub.max ?? "100";
  const step = sub.step ?? "1";
  const current = value !== "" ? value : (sub.default ?? min);
  return `<div class="ext-list-sub">
      <span class="ext-list-sub-label ext-field-range-label">
        <span>${escapeHtml(sub.label)}</span>
        <output class="ext-list-range-value">${escapeHtml(current)}</output>
      </span>
      <input class="ext-list-subfield ext-list-range" type="range" data-subkey="${escapeHtml(sub.key)}" data-subtype="text" min="${escapeHtml(min)}" max="${escapeHtml(max)}" step="${escapeHtml(step)}" value="${escapeHtml(current)}">
    </div>`;
};

const _renderFile = (sub: SettingField, value: string): string => {
  const hintParts: string[] = [];
  if (sub.accept) hintParts.push(sub.accept);
  if (sub.maxSizeKb) hintParts.push(`≤ ${sub.maxSizeKb} KB`);
  const uploader = renderFileUpload({
    inputId: `file-list-${sub.key}-${Math.random().toString(36).slice(2, 8)}`,
    accept: sub.accept,
    buttonLabel: t("settings-page.modal.field-choose-file"),
    dropLabel: t("settings-page.modal.field-drop-hint"),
    hint: hintParts.join(" · ") || undefined,
    currentName: value ? basenameOf(value) : undefined,
  });
  const maxAttr = sub.maxSizeKb ? ` data-max-kb="${escapeHtml(sub.maxSizeKb)}"` : "";
  const minAttr = sub.minSizeKb ? ` data-min-kb="${escapeHtml(sub.minSizeKb)}"` : "";
  return `<div class="ext-list-sub ext-list-sub--file"${maxAttr}${minAttr}>
      <span class="ext-list-sub-label">${escapeHtml(sub.label)}</span>
      <input type="hidden" class="ext-list-subfield ext-list-file-value" data-subkey="${escapeHtml(sub.key)}" data-subtype="text" value="${escapeHtml(value)}">
      ${uploader}
      <p class="ext-list-file-status" hidden></p>
    </div>`;
};

const _renderSubField = (sub: SettingField, row: ListRow): string => {
  const value = row[sub.key] ?? "";
  if (isListToggle(sub)) return _renderToggle(sub, value);
  if (isListDisplay(sub)) return _renderInfo(sub);
  if (sub.type === "textarea") return _renderTextarea(sub, value);
  if (sub.type === "select") return _renderSelect(sub, value);
  if (sub.type === "hex") return _renderHex(sub, value);
  if (sub.type === "range") return _renderRange(sub, value);
  if (sub.type === "file") return _renderFile(sub, value);
  return _renderInput(sub, value);
};

const _renderRow = (row: ListRow, itemSchema: SettingField[]): string => {
  const editor = itemSchema
    .map((sub) => _renderSubField(sub, row))
    .join("");
  return `<div class="ext-list-row">
      <div class="ext-list-row-head">
        <span class="degoog-drag-handle ext-list-row-drag" data-drag-handle tabindex="0" role="button" title="${escapeHtml(t("settings-page.extensions.drag-to-reorder"))}" aria-label="${escapeHtml(t("settings-page.extensions.drag-to-reorder"))}"><i class="fa-solid fa-grip-vertical"></i></span>
        <span class="ext-list-row-summary">${escapeHtml(rowSummary(row, itemSchema))}</span>
        <button type="button" class="ext-list-row-edit" aria-label="${escapeHtml(t("settings-page.modal.field-edit-aria"))}">✎</button>
        <button type="button" class="ext-list-row-remove" aria-label="${escapeHtml(t("settings-page.modal.field-remove-aria"))}">×</button>
      </div>
      <div class="ext-list-row-editor" hidden>${editor}</div>
    </div>`;
};

export const renderListField = (
  field: SettingField,
  ext: ExtensionMeta,
): string => {
  const itemSchema = field.itemSchema ?? [];
  const rows = parseListValue(ext.settings[field.key], itemSchema);
  const descHtml = field.description
    ? `<p class="ext-field-desc">${renderMdInline(field.description)}</p>`
    : "";
  const addLabel = escapeHtml(field.addLabel || t("settings-page.modal.field-add"));
  const schemaAttr = encodeURIComponent(JSON.stringify(itemSchema));
  const rowsHtml = rows.map((row) => _renderRow(row, itemSchema)).join("");
  return `<div class="ext-field" data-key="${escapeHtml(field.key)}" data-type="list" data-item-schema="${schemaAttr}">
      <label class="ext-field-label">${escapeHtml(field.label)}</label>
      <div class="ext-list">
        <div class="ext-list-rows">${rowsHtml}</div>
        <button type="button" class="ext-list-add btn btn--secondary degoog-btn degoog-btn--secondary">${addLabel}</button>
      </div>
      <input type="hidden" id="field-${escapeHtml(field.key)}" class="ext-field-list-value">
      ${descHtml}
    </div>`;
};

const _readSchema = (fieldEl: HTMLElement): SettingField[] => {
  try {
    const raw = fieldEl.dataset.itemSchema || "";
    const parsed = JSON.parse(raw ? decodeURIComponent(raw) : "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as SettingField[]) : [];
  } catch {
    return [];
  }
};

const _collectRow = (
  rowEl: HTMLElement,
  itemSchema: SettingField[],
): ListRow => {
  const row: ListRow = {};
  rowEl
    .querySelectorAll<HTMLElement>(".ext-list-subfield")
    .forEach((input) => {
      const key = input.dataset.subkey;
      if (!key) return;
      if (input.dataset.subtype === "toggle") {
        row[key] = (input as HTMLInputElement).checked ? "true" : "false";
      } else {
        row[key] = (input as HTMLInputElement | HTMLTextAreaElement).value.trim();
      }
    });
  for (const sub of itemSchema) {
    if (!(sub.key in row)) row[sub.key] = "";
  }
  return row;
};

export const initListFields = (container: HTMLElement, extId: string): void => {
  container
    .querySelectorAll<HTMLElement>(".ext-field[data-type='list']")
    .forEach((fieldEl) => _initOne(fieldEl, extId));
};

const _bindHexSub = (rowEl: HTMLElement, onChange: () => void): void => {
  rowEl.querySelectorAll<HTMLElement>(".ext-list-sub").forEach((sub) => {
    const text = sub.querySelector<HTMLInputElement>(".ext-list-hex-text");
    const color = sub.querySelector<HTMLInputElement>(".ext-list-hex-color");
    if (!text || !color) return;
    text.addEventListener("input", () => {
      if (HEX_RE.test(text.value.trim())) color.value = normalizeHex(text.value);
    });
    color.addEventListener("input", () => {
      text.value = color.value;
      onChange();
    });
  });
};

const _bindRangeSub = (rowEl: HTMLElement): void => {
  rowEl.querySelectorAll<HTMLInputElement>(".ext-list-range").forEach((range) => {
    const out = range.parentElement?.querySelector<HTMLElement>(
      ".ext-list-range-value",
    );
    range.addEventListener("input", () => {
      if (out) out.textContent = range.value;
    });
  });
};

const _validateSubSize = (sub: HTMLElement, file: File): string | null => {
  const maxKb = Number(sub.dataset.maxKb ?? "0");
  const minKb = Number(sub.dataset.minKb ?? "0");
  const sizeKb = file.size / 1024;
  if (maxKb > 0 && sizeKb > maxKb) return `≤ ${maxKb} KB`;
  if (minKb > 0 && sizeKb < minKb) return `≥ ${minKb} KB`;
  return null;
};

const _bindFileSub = (
  rowEl: HTMLElement,
  extId: string,
  onChange: () => void,
): void => {
  rowEl.querySelectorAll<HTMLElement>(".ext-list-sub--file").forEach((sub) => {
    const hidden = sub.querySelector<HTMLInputElement>(".ext-list-file-value");
    const status = sub.querySelector<HTMLElement>(".ext-list-file-status");
    const key = hidden?.dataset.subkey;
    if (!hidden || !key) return;

    const setStatus = (text: string): void => {
      if (!status) return;
      status.textContent = text;
      status.hidden = text === "";
    };

    const handle = initFileUpload(sub, async (file) => {
      if (!file) {
        hidden.value = "";
        setStatus("");
        onChange();
        return;
      }
      const sizeError = _validateSubSize(sub, file);
      if (sizeError) {
        setStatus(sizeError);
        handle?.reset();
        return;
      }
      setStatus(t("settings-page.modal.field-uploading"));
      const path = await uploadExtensionFile(extId, key, file).catch(() => null);
      if (!path) {
        setStatus(t("settings-page.modal.field-upload-failed"));
        handle?.reset();
        return;
      }
      hidden.value = path;
      setStatus("");
      onChange();
    });
  });
};

const _initOne = (fieldEl: HTMLElement, extId: string): void => {
  const itemSchema = _readSchema(fieldEl);
  const rowsEl = fieldEl.querySelector<HTMLElement>(".ext-list-rows");
  const addBtn = fieldEl.querySelector<HTMLElement>(".ext-list-add");
  const hidden = fieldEl.querySelector<HTMLInputElement>(
    ".ext-field-list-value",
  );
  if (!rowsEl || !addBtn || !hidden) return;

  const sync = (): void => {
    const rows = [
      ...rowsEl.querySelectorAll<HTMLElement>(".ext-list-row"),
    ].map((rowEl) => _collectRow(rowEl, itemSchema));
    hidden.value = serializeRows(rows, itemSchema);
  };

  const updateSummary = (rowEl: HTMLElement): void => {
    const summary = rowEl.querySelector<HTMLElement>(".ext-list-row-summary");
    if (summary) {
      summary.textContent = rowSummary(_collectRow(rowEl, itemSchema), itemSchema) || "…";
    }
  };

  const bindRow = (rowEl: HTMLElement): void => {
    const editor = rowEl.querySelector<HTMLElement>(".ext-list-row-editor");
    rowEl
      .querySelector(".ext-list-row-edit")
      ?.addEventListener("click", () => {
        if (editor) editor.hidden = !editor.hidden;
      });
    rowEl
      .querySelector(".ext-list-row-remove")
      ?.addEventListener("click", () => {
        rowEl.remove();
        sync();
      });
    const rowChanged = (): void => {
      updateSummary(rowEl);
      sync();
    };
    rowEl.querySelectorAll<HTMLElement>(".ext-list-subfield").forEach((input) => {
      input.addEventListener("input", rowChanged);
      input.addEventListener("change", rowChanged);
    });
    _bindHexSub(rowEl, rowChanged);
    _bindRangeSub(rowEl);
    _bindFileSub(rowEl, extId, rowChanged);
  };

  rowsEl
    .querySelectorAll<HTMLElement>(".ext-list-row")
    .forEach((rowEl) => bindRow(rowEl));

  initDragOrder(rowsEl, {
    itemSelector: ".ext-list-row",
    handleSelector: "[data-drag-handle]",
    onReorder: () => sync(),
  });

  addBtn.addEventListener("click", () => {
    const wrap = document.createElement("div");
    wrap.innerHTML = _renderRow(defaultListRow(itemSchema), itemSchema);
    const rowEl = wrap.firstElementChild as HTMLElement | null;
    if (!rowEl) return;
    const editor = rowEl.querySelector<HTMLElement>(".ext-list-row-editor");
    if (editor) editor.hidden = false;
    rowsEl.appendChild(rowEl);
    bindRow(rowEl);
    sync();
    rowEl.querySelector<HTMLElement>(".ext-list-subfield")?.focus();
  });

  sync();
};
