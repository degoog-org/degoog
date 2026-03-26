import { renderField, initUrlList } from "./modal-fields";
import { getStoredToken } from "../../settings/settings";
import { jsonHeaders } from "../../../utils/request";
import type { ExtensionMeta } from "../../../types";

const overlay = document.getElementById("ext-modal-overlay");
const titleEl = document.getElementById("ext-modal-title");
const bodyEl = document.getElementById("ext-modal-body");
const saveBtn = document.getElementById(
  "ext-modal-save",
) as HTMLButtonElement | null;
const closeBtn = document.getElementById("ext-modal-close");
const statusEl = document.getElementById("ext-modal-status");

let currentExt: ExtensionMeta | null = null;

const _collectValues = (): Record<string, string | string[]> => {
  const values: Record<string, string | string[]> = {};
  bodyEl?.querySelectorAll<HTMLElement>(".ext-field").forEach((fieldEl) => {
    const key = fieldEl.dataset.key;
    if (!key) return;
    const type = fieldEl.dataset.type;
    const isSecret = fieldEl.dataset.secret === "true";
    const wasSet = fieldEl.dataset.wasSet === "true";

    if (type === "toggle") {
      const input = fieldEl.querySelector<HTMLInputElement>(
        "input[type=checkbox]",
      );
      values[key] = input?.checked ? "true" : "false";
      return;
    }
    if (type === "select") {
      const select = fieldEl.querySelector<HTMLSelectElement>("select");
      values[key] = select ? select.value : "";
      return;
    }
    if (type === "urllist") {
      const hidden = fieldEl.querySelector<HTMLInputElement>(
        ".ext-field-urllist-value",
      );
      try {
        const parsed = hidden?.value
          ? (JSON.parse(hidden.value) as unknown)
          : [];
        values[key] = Array.isArray(parsed) ? (parsed as string[]) : [];
      } catch {
        values[key] = [];
      }
      return;
    }

    const input =
      fieldEl.querySelector<HTMLTextAreaElement>("textarea") ||
      fieldEl.querySelector<HTMLInputElement>("input");
    const val = input ? input.value.trim() : "";

    if (isSecret) {
      if (val === "" && wasSet) return;
      values[key] = val;
    } else {
      values[key] = val;
    }
  });
  return values;
};

export function openModal(ext: ExtensionMeta): void {
  currentExt = ext;
  if (titleEl) titleEl.textContent = `Configure ${ext.displayName}`;
  if (statusEl) statusEl.textContent = "";

  if (bodyEl) {
    bodyEl.innerHTML = ext.settingsSchema
      .map((field) =>
        renderField(field, String(ext.settings[field.key] ?? ""), ext),
      )
      .join("");
    initUrlList(bodyEl);
    bodyEl
      .querySelectorAll<HTMLElement>(".ext-field-input--configured")
      .forEach((input) => {
        input.addEventListener(
          "focus",
          () => input.classList.remove("ext-field-input--configured"),
          {
            once: true,
          },
        );
      });
  }

  if (overlay) overlay.style.display = "flex";
  const firstFocusable = bodyEl?.querySelector<HTMLElement>(
    "select, input, textarea",
  );
  firstFocusable?.focus();
}

export function closeModal(): void {
  if (overlay) overlay.style.display = "none";
  currentExt = null;
  if (statusEl) statusEl.textContent = "";
}

async function _save(): Promise<void> {
  if (!currentExt) return;
  const values = _collectValues();
  if (saveBtn) saveBtn.disabled = true;
  if (statusEl) statusEl.textContent = "Saving…";
  try {
    const res = await fetch(
      `/api/extensions/${encodeURIComponent(currentExt.id)}/settings`,
      {
        method: "POST",
        headers: jsonHeaders(getStoredToken),
        body: JSON.stringify(values),
      },
    );
    if (!res.ok) throw new Error("Failed");
    if (statusEl) statusEl.textContent = "Saved";
    window.dispatchEvent(new CustomEvent("extensions-saved"));
    setTimeout(closeModal, 800);
  } catch {
    if (statusEl) statusEl.textContent = "Save failed. Please try again.";
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

saveBtn?.addEventListener("click", () => void _save());
closeBtn?.addEventListener("click", closeModal);
overlay?.addEventListener("click", (e) => {
  if (e.target === overlay) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});
