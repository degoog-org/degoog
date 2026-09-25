import { RawDogIt } from "../../tribute/rawdogit";
import type { Child } from "../../tribute/types";

export interface ModalProps {
  /** Id prefix. Yields `<id>-overlay`, `<id>`, `<id>-title`, `<id>-body`, `<id>-close`. */
  id: string;
  title?: string;
  wide?: boolean;
  modalClass?: string;
  bodyClass?: string;
  children?: Child;
  footer?: Child;
}

const _modalClass = (wide?: boolean, extra?: string): string => {
  const parts = ["ext-modal"];
  if (wide) parts.push("ext-modal--wide");
  if (extra) parts.push(extra);
  return parts.join(" ");
};

export const Modal = ({
  id,
  title,
  wide,
  modalClass,
  bodyClass,
  children,
  footer,
}: ModalProps): JSX.Element => (
  <div class="ext-modal-overlay" id={`${id}-overlay`} style="display: none">
    <div
      class={_modalClass(wide, modalClass)}
      id={id}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
    >
      <div class="ext-modal-header">
        <h2 class="ext-modal-title" id={`${id}-title`}>
          {title ?? ""}
        </h2>
        <button
          class="ext-modal-close degoog-icon-btn"
          id={`${id}-close`}
          type="button"
        >
          <RawDogIt html={"&times;"} />
        </button>
      </div>
      <div
        class={bodyClass ? `ext-modal-body ${bodyClass}` : "ext-modal-body"}
        id={`${id}-body`}
      >
        {children}
      </div>
      {footer === undefined ? null : (
        <div class="ext-modal-footer">{footer}</div>
      )}
    </div>
  </div>
);
