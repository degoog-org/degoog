import { render } from "../../../../../shared/ui/tribute/dom";
import { initDragOrder } from "../../../../utils/dom/drag-order";
import { initFileUpload } from "../../../../utils/file-upload/file-upload";
import { ExtField } from "../fields/ext-field";
import { fieldDesc } from "../fields/field-desc";
import { ListFieldRow } from "./list-field-row";
import { HEX_RE, normalizeHex, uploadExtensionFile } from "../fields/field-widgets";
import {
  defaultListRow,
  parseListValue,
  serializeRows,
  rowSummary,
  type ListRow,
} from "./list-field-data";
import type { ExtensionMeta } from "../../../../types/extension";
import type { SettingField } from "../../../../../shared/setting-field";

const t = window.scopedT("core");

export const ListField = ({
  field,
  ext,
}: {
  field: SettingField;
  ext: ExtensionMeta;
}): JSX.Element => {
  const itemSchema = field.itemSchema ?? [];
  const rows = parseListValue(ext.settings[field.key], itemSchema);
  return (
    <ExtField
      fieldKey={field.key}
      type="list"
      extra={{
        "data-item-schema": encodeURIComponent(JSON.stringify(itemSchema)),
      }}
    >
      <label class="ext-field-label">{field.label}</label>
      <div class="ext-list">
        <div class="ext-list-rows">
          {rows.map((row, at) => (
            <ListFieldRow key={String(at)} row={row} itemSchema={itemSchema} />
          ))}
        </div>
        <button
          type="button"
          class="ext-list-add btn btn--secondary degoog-btn degoog-btn--secondary"
        >
          {field.addLabel || t("settings-page.modal.field-add")}
        </button>
      </div>
      <input
        type="hidden"
        id={`field-${field.key}`}
        class="ext-field-list-value"
      />
      {fieldDesc(field.description)}
    </ExtField>
  );
};

const _readSchema = (fieldEl: HTMLElement): SettingField[] => {
  try {
    const encoded = fieldEl.dataset.itemSchema || "";
    const parsed = JSON.parse(
      encoded ? decodeURIComponent(encoded) : "[]",
    ) as unknown;
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
  rowEl.querySelectorAll<HTMLElement>(".ext-list-subfield").forEach((input) => {
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
      if (HEX_RE.test(text.value.trim()))
        color.value = normalizeHex(text.value);
    });
    color.addEventListener("input", () => {
      text.value = color.value;
      onChange();
    });
  });
};

const _bindRangeSub = (rowEl: HTMLElement): void => {
  rowEl
    .querySelectorAll<HTMLInputElement>(".ext-list-range")
    .forEach((range) => {
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
      const path = await uploadExtensionFile(extId, key, file).catch(
        () => null,
      );
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
    const rows = [...rowsEl.querySelectorAll<HTMLElement>(".ext-list-row")].map(
      (rowEl) => _collectRow(rowEl, itemSchema),
    );
    hidden.value = serializeRows(rows, itemSchema);
  };

  const updateSummary = (rowEl: HTMLElement): void => {
    const summary = rowEl.querySelector<HTMLElement>(".ext-list-row-summary");
    if (summary) {
      summary.textContent =
        rowSummary(_collectRow(rowEl, itemSchema), itemSchema) || "…";
    }
  };

  const bindRow = (rowEl: HTMLElement): void => {
    const editor = rowEl.querySelector<HTMLElement>(".ext-list-row-editor");
    rowEl.querySelector(".ext-list-row-edit")?.addEventListener("click", () => {
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
    rowEl
      .querySelectorAll<HTMLElement>(".ext-list-subfield")
      .forEach((input) => {
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
    render(
      <ListFieldRow row={defaultListRow(itemSchema)} itemSchema={itemSchema} />,
      wrap,
    );
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
