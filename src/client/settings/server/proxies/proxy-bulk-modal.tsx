import { clear, render } from "../../../../shared/ui/tribute/dom";
import { borrowModal, claimModal, closeModal } from "../../../modules/modals/settings-modal/modal";
import { PROXY_BULK_INPUT_ID, ProxyBulkBody } from "./proxy-bulk-body";

const t = window.scopedT("core");

export const splitProxyLines = (raw: string): string[] =>
  raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

export function openProxyBulkModal(onAdd: (urls: string[]) => void): void {
  const overlay = document.getElementById("ext-modal-overlay");
  const titleEl = document.getElementById("ext-modal-title");
  const bodyEl = document.getElementById("ext-modal-body");
  const saveEl = document.getElementById("ext-modal-save");
  if (!overlay || !titleEl || !bodyEl || !saveEl) return;

  claimModal();
  titleEl.textContent = t("settings-page.server.proxy-bulk-title");
  render(<ProxyBulkBody />, bodyEl);
  overlay.style.display = "";

  borrowModal({
    onSave: () => {
      const input = document.getElementById(PROXY_BULK_INPUT_ID) as HTMLTextAreaElement | null;
      onAdd(splitProxyLines(input?.value ?? ""));
      closeModal();
    },
    onClose: () => clear(bodyEl),
  });
  saveEl.textContent = t("settings-page.server.proxy-bulk-confirm");
  document.getElementById(PROXY_BULK_INPUT_ID)?.focus();
}
