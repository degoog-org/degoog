import { Button } from "../../../../shared/ui/components/primitives/button";
import { mountModalShell, type MountedModal } from "../../../../shared/ui/components/overlay/shell";

type PromptOptions = {
  title: string;
  label?: string;
  description?: string;
  defaultValue?: string;
  type?: "text" | "number";
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

const MODAL_ID = "result-prompt";

let shell: MountedModal | null = null;
let descEl: HTMLParagraphElement | null = null;
let labelEl: HTMLLabelElement | null = null;
let inputEl: HTMLInputElement | null = null;
let confirmBtn: HTMLButtonElement | null = null;
let cancelBtn: HTMLButtonElement | null = null;
let resolveFn: ((value: string | null) => void) | null = null;

const t = window.scopedT("themes/degoog");

function _finish(value: string | null): void {
  shell?.hide();
  if (resolveFn) {
    resolveFn(value);
    resolveFn = null;
  }
}

function _submit(): void {
  if (!inputEl) return _finish(null);
  const value = inputEl.value.trim();
  if (!value) return _finish(null);
  _finish(value);
}

function _ensureMounted(): void {
  if (shell) return;

  shell = mountModalShell({
    id: MODAL_ID,
    children: (
      <>
        <p id={`${MODAL_ID}-desc`} class="ext-modal-desc"></p>
        <div class="ext-field">
          <label
            class="ext-field-label"
            id={`${MODAL_ID}-label`}
            for={`${MODAL_ID}-input`}
          ></label>
          <input class="ext-field-input degoog-input" id={`${MODAL_ID}-input`} />
        </div>
      </>
    ),
    footer: [
      Button({ variant: "secondary", id: `${MODAL_ID}-cancel` }),
      Button({ variant: "primary", id: `${MODAL_ID}-confirm` }),
    ],
  });

  descEl = document.getElementById(`${MODAL_ID}-desc`) as HTMLParagraphElement | null;
  labelEl = document.getElementById(`${MODAL_ID}-label`) as HTMLLabelElement | null;
  inputEl = document.getElementById(`${MODAL_ID}-input`) as HTMLInputElement | null;
  cancelBtn = document.getElementById(`${MODAL_ID}-cancel`) as HTMLButtonElement | null;
  confirmBtn = document.getElementById(`${MODAL_ID}-confirm`) as HTMLButtonElement | null;

  cancelBtn?.addEventListener("click", () => _finish(null));
  shell.close.addEventListener("click", () => _finish(null));
  confirmBtn?.addEventListener("click", () => _submit());
  shell.overlay.addEventListener("click", (e) => {
    if (e.target === shell?.overlay) _finish(null);
  });
  inputEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      _submit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      _finish(null);
    }
  });
}

export const promptModal = (options: PromptOptions): Promise<string | null> =>
  new Promise((resolve) => {
    _ensureMounted();
    if (resolveFn) resolveFn(null);
    resolveFn = resolve;

    if (shell) shell.title.textContent = options.title;
    if (descEl) {
      descEl.textContent = options.description ?? "";
      descEl.style.display = options.description ? "" : "none";
    }
    if (labelEl) {
      labelEl.textContent = options.label ?? "";
      labelEl.style.display = options.label ? "" : "none";
    }
    if (inputEl) {
      inputEl.type = options.type ?? "text";
      inputEl.value = options.defaultValue ?? "";
      inputEl.placeholder = options.placeholder ?? "";
    }
    if (confirmBtn) {
      confirmBtn.textContent =
        options.confirmLabel ?? t("search-templates.result.actions.modal-confirm");
    }
    if (cancelBtn) {
      cancelBtn.textContent =
        options.cancelLabel ?? t("search-templates.result.actions.modal-cancel");
    }
    shell?.open();
    setTimeout(() => inputEl?.focus(), 0);
  });
