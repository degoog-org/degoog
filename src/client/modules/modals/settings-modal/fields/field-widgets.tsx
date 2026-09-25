import { initFileUpload } from "../../../../utils/file-upload/file-upload";
import { getBase } from "../../../../utils/net/base-url";
import { getStoredToken } from "../../../settings/settings";
import { authHeaders } from "../../../../utils/net/request";

const t = window.scopedT("core");

export const DEFAULT_HEX = "#000000";
export const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const basenameOf = (path: string): string =>
  path.split("/").pop() ?? path;

export const normalizeHex = (value: string): string =>
  HEX_RE.test(value.trim()) ? value.trim() : DEFAULT_HEX;

export const initHexFields = (container: HTMLElement): void => {
  container
    .querySelectorAll<HTMLElement>(".ext-field[data-type='hex']")
    .forEach((fieldEl) => {
      const text = fieldEl.querySelector<HTMLInputElement>(".ext-field-hex-text");
      const color = fieldEl.querySelector<HTMLInputElement>(".ext-field-hex-color");
      if (!text || !color) return;
      text.addEventListener("input", () => {
        if (HEX_RE.test(text.value.trim())) color.value = normalizeHex(text.value);
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
