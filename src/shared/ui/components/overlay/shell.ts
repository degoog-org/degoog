import { renderHtml } from "../../core/html";
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
