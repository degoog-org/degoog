const t = window.scopedT("themes/degoog");

let overlay: HTMLDivElement | null = null;
let titleEl: HTMLHeadingElement | null = null;
let bodyEl: HTMLDivElement | null = null;
let confirmBtn: HTMLButtonElement | null = null;
let cancelBtn: HTMLButtonElement | null = null;
let closeBtn: HTMLButtonElement | null = null;
let resolveConfirm: ((value: boolean) => void) | null = null;

function _ensureMounted(): void {
  if (overlay) return;

  overlay = document.createElement("div");
  overlay.className = "ext-modal-overlay";
  overlay.id = "confirm-modal-overlay";
  overlay.style.display = "none";

  const modal = document.createElement("div");
  modal.className = "ext-modal";
  modal.id = "confirm-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "confirm-modal-title");

  const header = document.createElement("div");
  header.className = "ext-modal-header";
  titleEl = document.createElement("h2");
  titleEl.className = "ext-modal-title";
  titleEl.id = "confirm-modal-title";
  closeBtn = document.createElement("button");
  closeBtn.className = "ext-modal-close";
  closeBtn.id = "confirm-modal-close";
  closeBtn.type = "button";
  closeBtn.innerHTML = "&times;";
  header.append(titleEl, closeBtn);

  bodyEl = document.createElement("div");
  bodyEl.className = "ext-modal-body";
  bodyEl.id = "confirm-modal-body";

  const footer = document.createElement("div");
  footer.className = "ext-modal-footer";
  cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn--secondary";
  cancelBtn.id = "confirm-modal-cancel";
  cancelBtn.type = "button";
  cancelBtn.textContent = t("search-templates.result.actions.modal-cancel");
  confirmBtn = document.createElement("button");
  confirmBtn.className = "btn btn--primary";
  confirmBtn.id = "confirm-modal-confirm";
  confirmBtn.type = "button";
  confirmBtn.textContent = t("search-templates.result.actions.modal-confirm");
  footer.append(cancelBtn, confirmBtn);

  modal.append(header, bodyEl, footer);
  overlay.append(modal);
  document.body.appendChild(overlay);

  cancelBtn.addEventListener("click", () => _finish(false));
  closeBtn.addEventListener("click", () => _finish(false));
  confirmBtn.addEventListener("click", () => _finish(true));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) _finish(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay?.style.display === "flex") _finish(false);
  });
}

function _finish(value: boolean): void {
  if (overlay) overlay.style.display = "none";
  if (resolveConfirm) {
    resolveConfirm(value);
    resolveConfirm = null;
  }
}

export function confirmModal(options: {
  message: string;
  title?: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    _ensureMounted();
    if (resolveConfirm) resolveConfirm(false);
    resolveConfirm = resolve;
    if (titleEl) titleEl.textContent = options.title ?? t("search-templates.result.actions.modal-confirm");
    if (bodyEl) bodyEl.textContent = options.message;
    if (overlay) overlay.style.display = "flex";
    confirmBtn?.focus();
  });
}
