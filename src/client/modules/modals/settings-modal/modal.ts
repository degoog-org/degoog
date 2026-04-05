import { renderField, initUrlList } from "./modal-fields";
import { getStoredToken } from "../../settings/settings";
import { jsonHeaders } from "../../../utils/request";
import type { ExtensionMeta, SettingField } from "../../../types";

const t = window.scopedT("core");

const overlay = document.getElementById("ext-modal-overlay");
const titleEl = document.getElementById("ext-modal-title");
const bodyEl = document.getElementById("ext-modal-body");
const saveBtn = document.getElementById(
  "ext-modal-save",
) as HTMLButtonElement | null;
const closeBtn = document.getElementById("ext-modal-close");
const statusEl = document.getElementById("ext-modal-status");

let currentExt: ExtensionMeta | null = null;

const _initTestButton = (container: HTMLElement): void => {
  const btn = container.querySelector<HTMLButtonElement>(".ext-test-btn");
  if (!btn) return;
  const resultEl = container.querySelector<HTMLElement>(".ext-test-result");
  btn.addEventListener("click", async () => {
    const transport = btn.dataset.transport;
    if (!transport) return;
    btn.disabled = true;
    if (resultEl) {
      resultEl.textContent = t("settings-page.modal.test-testing");
      resultEl.className = "ext-test-result";
    }
    try {
      const res = await fetch(
        `/api/extensions/transports/${encodeURIComponent(transport)}/test`,
        { method: "POST", headers: jsonHeaders(getStoredToken) },
      );
      const data = (await res.json()) as { ok: boolean; message: string };
      if (resultEl) {
        resultEl.textContent = data.message;
        resultEl.classList.add(data.ok ? "ext-test-ok" : "ext-test-fail");
      }
    } catch {
      if (resultEl) {
        resultEl.textContent = t("settings-page.modal.test-request-failed");
        resultEl.classList.add("ext-test-fail");
      }
    } finally {
      btn.disabled = false;
    }
  });
};

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

const _advancedFieldDiffersFromDefault = (
  field: SettingField,
  settings: Record<string, string | string[]>,
): boolean => {
  const raw = settings[field.key];
  const defaultStr =
    field.default !== undefined && field.default !== null
      ? String(field.default)
      : "";

  if (field.type === "urllist") {
    return Array.isArray(raw) && raw.length > 0;
  }

  if (raw === undefined) {
    return false;
  }

  const val = Array.isArray(raw) ? raw.join("\n") : String(raw);

  if (field.type === "toggle") {
    const v = val === "true" ? "true" : "false";
    const d = defaultStr === "true" ? "true" : "false";
    return v !== d;
  }

  if (defaultStr === "") {
    return val.trim() !== "";
  }

  return val !== defaultStr;
};

export function openModal(ext: ExtensionMeta): void {
  currentExt = ext;
  if (titleEl)
    titleEl.textContent = t("settings-page.modal.configure-title", {
      name: ext.displayName,
    });
  if (statusEl) statusEl.textContent = "";

  if (bodyEl) {
    const normalFields = ext.settingsSchema.filter((f) => !f.advanced);
    const advancedFields = ext.settingsSchema.filter((f) => f.advanced);
    let html = normalFields
      .map((field) =>
        renderField(
          field,
          String(ext.settings[field.key] ?? field.default ?? ""),
          ext,
        ),
      )
      .join("");
    if (advancedFields.length > 0) {
      const showAdvanced = advancedFields.some((f) =>
        _advancedFieldDiffersFromDefault(f, ext.settings),
      );
      html += `<div class="ext-advanced-section">
        <label class="ext-field-toggle-row ext-advanced-header">
          <span class="ext-field-label">${t("settings-page.modal.advanced")}</span>
          <label class="engine-toggle">
            <input type="checkbox" class="ext-advanced-toggle"${showAdvanced ? " checked" : ""}>
            <span class="toggle-slider"></span>
          </label>
        </label>
        <div class="ext-advanced-body"${showAdvanced ? "" : " hidden"}>${advancedFields
          .map((field) =>
            renderField(
              field,
              String(ext.settings[field.key] ?? field.default ?? ""),
              ext,
            ),
          )
          .join("")}</div>
      </div>`;
    }
    if (ext.id.startsWith("transport-") && ext.configurable) {
      const transportName = ext.id.slice(10);
      html += `<div class="ext-test-connection">
        <button type="button" class="ext-test-btn" data-transport="${transportName}">${t("settings-page.modal.test-connection")}</button>
        <span class="ext-test-result"></span>
      </div>`;
    }
    bodyEl.innerHTML = html;
    bodyEl
      .querySelector(".ext-advanced-toggle")
      ?.addEventListener("change", (e) => {
        const body = bodyEl.querySelector<HTMLElement>(".ext-advanced-body");
        if (body) body.hidden = !(e.target as HTMLInputElement).checked;
      });
    _initTestButton(bodyEl);
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
  if (statusEl) statusEl.textContent = t("settings-page.modal.saving");
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
    if (statusEl) statusEl.textContent = t("settings-page.modal.saved");
    window.dispatchEvent(new CustomEvent("extensions-saved"));
    setTimeout(closeModal, 800);
  } catch {
    if (statusEl) statusEl.textContent = t("settings-page.modal.save-failed");
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
