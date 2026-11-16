import { renderHtml } from "../../tribute/html";
import { Modal, type ModalProps } from "./modal";

export interface MountedModal {
  overlay: HTMLDivElement;
  modal: HTMLDivElement;
  title: HTMLHeadingElement;
  body: HTMLDivElement;
  close: HTMLButtonElement;
  open: () => void;
  hide: () => void;
  isOpen: () => boolean;
}

const _require = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`modal element missing: ${id}`);
  return el as T;
};

/**
 * Renders a modal shell into document.body once and returns its parts.
 * Replaces the hand-rolled createElement shells each modal used to build.
 */
export const mountModalShell = (props: ModalProps): MountedModal => {
  const host = document.createElement("div");
  host.innerHTML = renderHtml(Modal(props));
  const overlay = host.firstElementChild as HTMLDivElement;
  document.body.appendChild(overlay);

  const shell: MountedModal = {
    overlay,
    modal: _require<HTMLDivElement>(props.id),
    title: _require<HTMLHeadingElement>(`${props.id}-title`),
    body: _require<HTMLDivElement>(`${props.id}-body`),
    close: _require<HTMLButtonElement>(`${props.id}-close`),
    open: (): void => {
      overlay.style.display = "flex";
    },
    hide: (): void => {
      overlay.style.display = "none";
    },
    isOpen: (): boolean => overlay.style.display === "flex",
  };
  return shell;
};

/**
 * Calls `onClose` only when the press and release both land on the overlay itself.
 * A plain `click` fires on the overlay when a drag starts or ends inside the modal.
 */
export const onBackdropClick = (
  overlay: HTMLElement,
  onClose: () => void,
): (() => void) => {
  let pressedOnOverlay = false;
  let releasedOnOverlay = false;
  const onDown = (e: MouseEvent): void => {
    pressedOnOverlay = e.target === overlay;
    releasedOnOverlay = false;
  };
  const onUp = (e: MouseEvent): void => {
    releasedOnOverlay = e.target === overlay;
  };
  const onClick = (e: MouseEvent): void => {
    const shouldClose =
      pressedOnOverlay && releasedOnOverlay && e.target === overlay;
    pressedOnOverlay = false;
    releasedOnOverlay = false;
    if (shouldClose) onClose();
  };
  overlay.addEventListener("mousedown", onDown);
  overlay.addEventListener("mouseup", onUp);
  overlay.addEventListener("click", onClick);
  return () => {
    overlay.removeEventListener("mousedown", onDown);
    overlay.removeEventListener("mouseup", onUp);
    overlay.removeEventListener("click", onClick);
  };
};
