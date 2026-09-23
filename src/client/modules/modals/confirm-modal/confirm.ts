import { Button } from "../../../../shared/ui/components/primitives/button";
import { mountModalShell, type MountedModal } from "../../../../shared/ui/components/overlay/shell";

const t = window.scopedT("themes/degoog");

const MODAL_ID = "confirm-modal";

let shell: MountedModal | null = null;
let confirmBtn: HTMLButtonElement | null = null;
let cancelBtn: HTMLButtonElement | null = null;
let resolveConfirm: ((value: boolean) => void) | null = null;

function _finish(value: boolean): void {
  shell?.hide();
  if (resolveConfirm) {
    resolveConfirm(value);
    resolveConfirm = null;
  }
}

function _ensureMounted(): void {
  if (shell) return;

  shell = mountModalShell({
    id: MODAL_ID,
    footer: [
      Button({
        variant: "secondary",
        id: `${MODAL_ID}-cancel`,
        children: t("search-templates.result.actions.modal-cancel"),
      }),
      Button({
        variant: "primary",
        id: `${MODAL_ID}-confirm`,
        children: t("search-templates.result.actions.modal-confirm"),
      }),
    ],
  });

  cancelBtn = document.getElementById(`${MODAL_ID}-cancel`) as HTMLButtonElement | null;
  confirmBtn = document.getElementById(`${MODAL_ID}-confirm`) as HTMLButtonElement | null;

  cancelBtn?.addEventListener("click", () => _finish(false));
  shell.close.addEventListener("click", () => _finish(false));
  confirmBtn?.addEventListener("click", () => _finish(true));
  shell.overlay.addEventListener("click", (e) => {
    if (e.target === shell?.overlay) _finish(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && shell?.isOpen()) _finish(false);
  });
}

export function confirmModal(options: {
  message: string;
  title?: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    _ensureMounted();
    if (resolveConfirm) resolveConfirm(false);
    resolveConfirm = resolve;
    if (shell) {
      shell.title.textContent =
        options.title ?? t("search-templates.result.actions.modal-confirm");
      shell.body.textContent = options.message;
      shell.open();
    }
    confirmBtn?.focus();
  });
}
