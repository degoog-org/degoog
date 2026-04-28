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

let overlay: HTMLDivElement | null = null;
let titleEl: HTMLHeadingElement | null = null;
let descEl: HTMLParagraphElement | null = null;
let labelEl: HTMLLabelElement | null = null;
let inputEl: HTMLInputElement | null = null;
let confirmBtn: HTMLButtonElement | null = null;
let cancelBtn: HTMLButtonElement | null = null;
let closeBtn: HTMLButtonElement | null = null;
let resolveFn: ((value: string | null) => void) | null = null;

const t = window.scopedT("themes/degoog");

function _ensureMounted(): void {
  if (overlay) return;

  overlay = document.createElement("div");
  overlay.className = "ext-modal-overlay";
  overlay.id = "result-prompt-overlay";
  overlay.style.display = "none";

  const modal = document.createElement("div");
  modal.className = "ext-modal";
  modal.id = "result-prompt-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "result-prompt-title");

  const header = document.createElement("div");
  header.className = "ext-modal-header";
  titleEl = document.createElement("h2");
  titleEl.className = "ext-modal-title";
  titleEl.id = "result-prompt-title";
  closeBtn = document.createElement("button");
  closeBtn.className = "ext-modal-close";
  closeBtn.id = "result-prompt-close";
  closeBtn.type = "button";
  closeBtn.innerHTML = "&times;";
  header.append(titleEl, closeBtn);

  const body = document.createElement("div");
  body.className = "ext-modal-body";
  descEl = document.createElement("p");
  descEl.id = "result-prompt-desc";
  descEl.className = "ext-modal-desc";
  const field = document.createElement("div");
  field.className = "ext-field";
  labelEl = document.createElement("label");
  labelEl.className = "ext-field-label";
  labelEl.id = "result-prompt-label";
  labelEl.htmlFor = "result-prompt-input";
  inputEl = document.createElement("input");
  inputEl.className = "ext-field-input";
  inputEl.id = "result-prompt-input";
  field.append(labelEl, inputEl);
  body.append(descEl, field);

  const footer = document.createElement("div");
  footer.className = "ext-modal-footer";
  cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn--secondary";
  cancelBtn.id = "result-prompt-cancel";
  cancelBtn.type = "button";
  confirmBtn = document.createElement("button");
  confirmBtn.className = "btn btn--primary";
  confirmBtn.id = "result-prompt-confirm";
  confirmBtn.type = "button";
  footer.append(cancelBtn, confirmBtn);

  modal.append(header, body, footer);
  overlay.append(modal);
  document.body.appendChild(overlay);

  cancelBtn.addEventListener("click", () => _finish(null));
  closeBtn.addEventListener("click", () => _finish(null));
  confirmBtn.addEventListener("click", () => _submit());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) _finish(null);
  });
  inputEl.addEventListener("keydown", (e) => {
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

function _submit(): void {
  if (!inputEl) return _finish(null);
  const value = inputEl.value.trim();
  if (!value) return _finish(null);
  _finish(value);
}

function _finish(value: string | null): void {
  if (overlay) overlay.style.display = "none";
  if (resolveFn) {
    resolveFn(value);
    resolveFn = null;
  }
}

export const promptModal = (options: PromptOptions): Promise<string | null> =>
  new Promise((resolve) => {
    _ensureMounted();
    if (resolveFn) resolveFn(null);
    resolveFn = resolve;

    if (titleEl) titleEl.textContent = options.title;
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
    if (overlay) overlay.style.display = "flex";
    setTimeout(() => inputEl?.focus(), 0);
  });
