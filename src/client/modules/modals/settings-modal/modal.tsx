import { clear, render } from "../../../../shared/ui/tribute/dom";
import { AdvancedSection } from "./fields/advanced-section";
import { TestConnection } from "./fields/test-connection";
import { renderField, syncConditionalFields } from "./modal-fields";
import { initUrlList } from "./fields/url-list-field";
import { initListFields } from "./list-field/list-field";
import { initMultiFields } from "./fields/multiselect-field";
import {
  initHexFields,
  initRangeFields,
  initFileFields,
} from "./fields/field-widgets";
import { initOptionsFields, disposeOptionsFields } from "./options-field/options-field";
import { getBase } from "../../../utils/net/base-url";
import { getStoredToken } from "../../../utils/settings/settings-token";
import { jsonHeaders } from "../../../utils/net/request";
import type { Child } from "../../../../shared/ui/tribute/types";
import type { ExtensionMeta } from "../../../types/extension";
import type { SettingField } from "../../../../shared/setting-field";
import { openExtensionDocs } from "../docs-modal/docs";
import {
  FORM_FIELD_SELECTOR,
  focusableIn,
  wrapTab,
} from "../../../utils/dom/focus-trap";

const t = window.scopedT("core");

const overlay = document.getElementById("ext-modal-overlay");
const dialogEl = document.getElementById("ext-modal");
const titleEl = document.getElementById("ext-modal-title");
const bodyEl = document.getElementById("ext-modal-body");
const saveBtn = document.getElementById(
  "ext-modal-save",
) as HTMLButtonElement | null;
const closeBtn = document.getElementById("ext-modal-close");
const statusEl = document.getElementById("ext-modal-status");
const footerEl = document.querySelector<HTMLElement>(".ext-modal-footer");

let modalBodyConditionalChangeBound = false;

let currentExt: ExtensionMeta | null = null;
let docsBtn: HTMLButtonElement | null = null;

export interface ModalBorrower {
  onSave?: () => void;
  onClose?: () => void;
}

let borrower: ModalBorrower | null = null;
let lease = 0;
let opener: HTMLElement | null = null;

const _rememberOpener = (): void => {
  const active = document.activeElement as HTMLElement | null;
  if (active && overlay?.contains(active)) return;
  opener = active && active !== document.body ? active : null;
};

const _restoreOpener = (): void => {
  const target = opener;
  opener = null;
  if (target?.isConnected) target.focus();
};

export const releaseModal = (): void => {
  const leaving = borrower;
  borrower = null;
  lease += 1;
  leaving?.onClose?.();
};

export const claimModal = (): (() => boolean) => {
  _rememberOpener();
  releaseModal();
  const mine = lease;
  return () => lease === mine;
};

export function borrowModal(next: ModalBorrower): void {
  borrower = next;
  _resetSaveButton();
}

function _resetSaveButton(): void {
  if (!saveBtn) return;
  saveBtn.textContent = t("settings-page.modal.save");
  saveBtn.disabled = false;
  saveBtn.hidden = false;
  saveBtn.style.display = "";
}

function _ensureDocsButton(): HTMLButtonElement | null {
  if (!footerEl) return null;
  if (docsBtn) return docsBtn;
  docsBtn = document.createElement("button");
  docsBtn.type = "button";
  docsBtn.className =
    "btn btn--secondary degoog-btn degoog-btn--secondary ext-docs-btn";
  docsBtn.textContent = t("settings-page.extensions.docs-button");
  docsBtn.style.display = "none";
  footerEl.insertBefore(docsBtn, footerEl.firstChild);
  docsBtn.addEventListener("click", () => {
    if (!currentExt) return;
    void openExtensionDocs({
      id: currentExt.id,
      title: `${currentExt.displayName} docs`,
    });
  });
  return docsBtn;
}

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
        `${getBase()}/api/extensions/transports/${encodeURIComponent(transport)}/test`,
        {
          method: "POST",
          headers: jsonHeaders(getStoredToken),
          body: JSON.stringify(_collectValues()),
        },
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
    if (type === "info") return;
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
    if (type === "list") {
      const hidden = fieldEl.querySelector<HTMLInputElement>(
        ".ext-field-list-value",
      );
      values[key] = hidden?.value?.trim() || "[]";
      return;
    }
    if (type === "multiselect") {
      const hidden = fieldEl.querySelector<HTMLInputElement>(
        ".ext-field-multiselect-value",
      );
      values[key] = (hidden?.value ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      return;
    }
    if (type === "file") {
      const hidden = fieldEl.querySelector<HTMLInputElement>(
        ".ext-field-file-value",
      );
      values[key] = hidden?.value?.trim() ?? "";
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

  if (field.type === "multiselect") {
    if (raw === undefined) return false;
    const picked = Array.isArray(raw) ? raw : String(raw ?? "").split(",");
    const chosen = picked.map((v) => v.trim()).filter(Boolean);
    const def = defaultStr
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    return chosen.slice().sort().join(",") !== def.slice().sort().join(",");
  }

  if (field.type === "list") {
    const val = typeof raw === "string" ? raw.trim() : "";
    const normalized = val === "[]" ? "" : val;
    const def = defaultStr === "[]" ? "" : defaultStr;
    return normalized !== def;
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

const _fieldValue = (field: SettingField, ext: ExtensionMeta): string =>
  String(ext.settings[field.key] ?? field.default ?? "");

const _renderFields = (fields: SettingField[], ext: ExtensionMeta): Child => {
  const order: string[] = [];
  const groups = new Map<string, SettingField[]>();
  fields.forEach((field, index) => {
    const set = field.fieldset?.trim();
    const key = set ? `set:${set}` : `solo:${index}`;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(field);
    } else {
      groups.set(key, [field]);
      order.push(key);
    }
  });
  return order.map((key) => {
    const inner = (groups.get(key) ?? []).map((field) =>
      renderField(field, _fieldValue(field, ext), ext),
    );
    if (!key.startsWith("set:")) return inner;
    return (
      <fieldset key={key} class="ext-fieldset">
        <legend class="ext-fieldset-legend">{key.slice(4)}</legend>
        {inner}
      </fieldset>
    );
  });
};

export function openModal(ext: ExtensionMeta): void {
  _rememberOpener();
  releaseModal();
  _resetSaveButton();
  currentExt = ext;
  const docs = _ensureDocsButton();
  if (docs) {
    docs.style.display = ext.extensionDocsAvailable ? "" : "none";
  }
  if (titleEl)
    titleEl.textContent = t("settings-page.modal.configure-title", {
      name: ext.displayName,
    });
  if (statusEl) statusEl.textContent = "";

  if (bodyEl) {
    const normalFields = ext.settingsSchema.filter((f) => !f.advanced);
    const advancedFields = ext.settingsSchema.filter((f) => f.advanced);
    const showAdvanced =
      advancedFields.length > 0 &&
      advancedFields.some((f) =>
        _advancedFieldDiffersFromDefault(f, ext.settings),
      );
    disposeOptionsFields();
    clear(bodyEl);
    render(
      <>
        {_renderFields(normalFields, ext)}
        {advancedFields.length > 0 ? (
          <AdvancedSection
            label={t("settings-page.modal.advanced")}
            expanded={showAdvanced}
          >
            {_renderFields(advancedFields, ext)}
          </AdvancedSection>
        ) : null}
        {ext.id.endsWith("-transport") && ext.configurable ? (
          <TestConnection
            transport={ext.id}
            label={t("settings-page.modal.test-connection")}
          />
        ) : null}
      </>,
      bodyEl,
    );
    if (!modalBodyConditionalChangeBound && bodyEl) {
      modalBodyConditionalChangeBound = true;
      bodyEl.addEventListener("change", () => syncConditionalFields(bodyEl));
    }
    bodyEl
      .querySelector(".ext-advanced-toggle")
      ?.addEventListener("change", (e) => {
        const body = bodyEl.querySelector<HTMLElement>(".ext-advanced-body");
        if (body) body.hidden = !(e.target as HTMLInputElement).checked;
        syncConditionalFields(bodyEl);
      });
    _initTestButton(bodyEl);
    initOptionsFields(bodyEl, ext.id, _collectValues);
    initUrlList(bodyEl);
    initListFields(bodyEl, ext.id);
    initMultiFields(bodyEl);
    initHexFields(bodyEl);
    initRangeFields(bodyEl);
    initFileFields(bodyEl, ext.id);
    syncConditionalFields(bodyEl);
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
  const fields = bodyEl ? focusableIn(bodyEl) : [];
  const first =
    fields.find((el) => el.matches(FORM_FIELD_SELECTOR)) ??
    fields[0] ??
    dialogEl;
  first?.focus();
}

export function closeModal(): void {
  const leaving = borrower;
  borrower = null;
  lease += 1;
  disposeOptionsFields();
  if (overlay) overlay.style.display = "none";
  currentExt = null;
  _resetSaveButton();
  if (statusEl) statusEl.textContent = "";
  dialogEl?.classList.remove("ext-modal--wide");
  leaving?.onClose?.();
  _restoreOpener();
}

export function openCustomModal(options: {
  title: string;
  wide?: boolean;
}): void {
  _rememberOpener();
  releaseModal();
  currentExt = null;
  if (options.wide) {
    dialogEl?.classList.add("ext-modal--wide");
  }
  const docs = docsBtn;
  if (docs) docs.style.display = "none";
  if (saveBtn) saveBtn.style.display = "none";
  if (titleEl) titleEl.textContent = options.title;
  disposeOptionsFields();
  if (bodyEl) clear(bodyEl);
  if (statusEl) statusEl.textContent = "";
  if (overlay) overlay.style.display = "flex";
  dialogEl?.focus();
}

async function _save(): Promise<void> {
  if (!currentExt) return;
  const values = _collectValues();
  if (saveBtn) saveBtn.disabled = true;
  if (statusEl) statusEl.textContent = t("settings-page.modal.saving");
  try {
    const res = await fetch(
      `${getBase()}/api/extensions/${encodeURIComponent(currentExt.id)}/settings`,
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

saveBtn?.addEventListener("click", () => {
  if (borrower) borrower.onSave?.();
  else void _save();
});
closeBtn?.addEventListener("click", closeModal);
overlay?.addEventListener("click", (e) => {
  if (e.target === overlay) closeModal();
});
const _isShown = (el: HTMLElement): boolean => el.style.display !== "none";

const _stackedOverlayOpen = (): boolean =>
  Array.from(
    document.querySelectorAll<HTMLElement>(".ext-modal-overlay"),
  ).some((el) => el !== overlay && _isShown(el));

document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented) return;
  if (!overlay || !_isShown(overlay) || _stackedOverlayOpen()) return;
  if (e.key === "Escape") closeModal();
  else if (dialogEl) wrapTab(e, dialogEl);
});
