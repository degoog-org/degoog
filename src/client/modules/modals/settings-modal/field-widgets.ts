import { escapeHtml } from "../../../utils/dom";
import { renderFileUpload, initFileUpload } from "../../../utils/file-upload";
import { getBase } from "../../../utils/base-url";
import { getStoredToken } from "../../settings/settings";
import { authHeaders } from "../../../utils/request";
import type { SettingField } from "../../../types";

const t = window.scopedT("core");

export const DEFAULT_HEX = "#000000";
export const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const basenameOf = (path: string): string =>
  path.split("/").pop() ?? path;

export const normalizeHex = (value: string): string =>
  HEX_RE.test(value.trim()) ? value.trim() : DEFAULT_HEX;

const _basename = basenameOf;
const _normalizeHex = normalizeHex;

export const renderHexField = (
  field: SettingField,
  value: string,
  descHtml: string,
): string => {
  const hex = value && HEX_RE.test(value) ? value : (field.default || DEFAULT_HEX);
  const swatch = _normalizeHex(hex);
  return `<div class="ext-field" data-key="${escapeHtml(field.key)}" data-type="hex">
      <label class="ext-field-label" for="field-${escapeHtml(field.key)}">${escapeHtml(field.label)}</label>
      <div class="ext-field-hex">
        <input class="ext-field-input ext-field-hex-text degoog-input" type="text" id="field-${escapeHtml(field.key)}" value="${escapeHtml(hex)}" placeholder="${escapeHtml(field.placeholder || DEFAULT_HEX)}" autocomplete="off">
        <input class="ext-field-hex-color" type="color" value="${escapeHtml(swatch)}" aria-label="${escapeHtml(field.label)}">
      </div>
      ${descHtml}
    </div>`;
};

export const renderRangeField = (
  field: SettingField,
  value: string,
  descHtml: string,
): string => {
  const min = field.min ?? "0";
  const max = field.max ?? "100";
  const step = field.step ?? "1";
  const current = value !== "" ? value : (field.default ?? min);
  return `<div class="ext-field" data-key="${escapeHtml(field.key)}" data-type="range">
      <label class="ext-field-label ext-field-range-label" for="field-${escapeHtml(field.key)}">
        <span>${escapeHtml(field.label)}</span>
        <output class="ext-field-range-value">${escapeHtml(current)}</output>
      </label>
      <input class="ext-field-range" type="range" id="field-${escapeHtml(field.key)}" min="${escapeHtml(min)}" max="${escapeHtml(max)}" step="${escapeHtml(step)}" value="${escapeHtml(current)}">
      ${descHtml}
    </div>`;
};

export const renderFileField = (
  field: SettingField,
  value: string,
  descHtml: string,
): string => {
  const hintParts: string[] = [];
  if (field.accept) hintParts.push(field.accept);
  if (field.maxSizeKb) hintParts.push(`≤ ${field.maxSizeKb} KB`);
  const hint = hintParts.join(" · ") || undefined;
  const uploader = renderFileUpload({
    inputId: `file-input-${field.key}`,
    accept: field.accept,
    buttonLabel: t("settings-page.modal.field-choose-file"),
    dropLabel: t("settings-page.modal.field-drop-hint"),
    hint,
    currentName: value ? _basename(value) : undefined,
  });
  const maxAttr = field.maxSizeKb ? ` data-max-kb="${escapeHtml(field.maxSizeKb)}"` : "";
  const minAttr = field.minSizeKb ? ` data-min-kb="${escapeHtml(field.minSizeKb)}"` : "";
  return `<div class="ext-field" data-key="${escapeHtml(field.key)}" data-type="file"${maxAttr}${minAttr}>
      <label class="ext-field-label">${escapeHtml(field.label)}</label>
      <input type="hidden" id="field-${escapeHtml(field.key)}" class="ext-field-file-value" value="${escapeHtml(value)}">
      ${uploader}
      <p class="ext-field-file-status" hidden></p>
      ${descHtml}
    </div>`;
};

export const initHexFields = (container: HTMLElement): void => {
  container
    .querySelectorAll<HTMLElement>(".ext-field[data-type='hex']")
    .forEach((fieldEl) => {
      const text = fieldEl.querySelector<HTMLInputElement>(".ext-field-hex-text");
      const color = fieldEl.querySelector<HTMLInputElement>(".ext-field-hex-color");
      if (!text || !color) return;
      text.addEventListener("input", () => {
        if (HEX_RE.test(text.value.trim())) color.value = _normalizeHex(text.value);
      });
      color.addEventListener("input", () => {
        text.value = color.value;
      });
    });
};

export const initRangeFields = (container: HTMLElement): void => {
  container
    .querySelectorAll<HTMLElement>(".ext-field[data-type='range']")
    .forEach((fieldEl) => {
      const range = fieldEl.querySelector<HTMLInputElement>(".ext-field-range");
      const out = fieldEl.querySelector<HTMLElement>(".ext-field-range-value");
      if (!range || !out) return;
      range.addEventListener("input", () => {
        out.textContent = range.value;
      });
    });
};

const _validateSize = (
  fieldEl: HTMLElement,
  file: File,
): string | null => {
  const maxKb = Number(fieldEl.dataset.maxKb ?? "0");
  const minKb = Number(fieldEl.dataset.minKb ?? "0");
  const sizeKb = file.size / 1024;
  if (maxKb > 0 && sizeKb > maxKb) return `≤ ${maxKb} KB`;
  if (minKb > 0 && sizeKb < minKb) return `≥ ${minKb} KB`;
  return null;
};

export const uploadExtensionFile = async (
  extId: string,
  key: string,
  file: File,
): Promise<string | null> => {
  const form = new FormData();
  form.append("key", key);
  form.append("file", file);
  const res = await fetch(
    `${getBase()}/api/extensions/${encodeURIComponent(extId)}/upload`,
    { method: "POST", headers: authHeaders(getStoredToken), body: form },
  );
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { path?: string } | null;
  return data?.path ?? null;
};

export const initFileFields = (container: HTMLElement, extId: string): void => {
  container
    .querySelectorAll<HTMLElement>(".ext-field[data-type='file']")
    .forEach((fieldEl) => {
      const key = fieldEl.dataset.key;
      const hidden = fieldEl.querySelector<HTMLInputElement>(".ext-field-file-value");
      const status = fieldEl.querySelector<HTMLElement>(".ext-field-file-status");
      if (!key || !hidden) return;

      const setStatus = (text: string): void => {
        if (!status) return;
        status.textContent = text;
        status.hidden = text === "";
      };

      const handle = initFileUpload(fieldEl, async (file) => {
        if (!file) {
          hidden.value = "";
          setStatus("");
          return;
        }
        const sizeError = _validateSize(fieldEl, file);
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
      });
    });
};
