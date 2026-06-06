import { getBase } from "../../utils/base-url";
import { jsonHeaders } from "../../utils/request";
import { getStoredToken } from "../../utils/settings-token";
import { tr } from "./i18n";

export const openClearModal = (onCleared: () => void): void => {
  const overlay = document.getElementById("ext-modal-overlay");
  const titleEl = document.getElementById("ext-modal-title");
  const bodyEl = document.getElementById("ext-modal-body");
  const statusEl = document.getElementById("ext-modal-status");
  const saveEl = document.getElementById("ext-modal-save") as HTMLButtonElement | null;
  const closeBtn = document.getElementById("ext-modal-close");
  if (!overlay || !titleEl || !bodyEl || !statusEl || !saveEl) return;

  titleEl.textContent = tr("clear-modal-title");
  bodyEl.innerHTML = `
    <p>${tr("clear-modal-desc")}</p>
    <input type="text" id="indexer-clear-confirm" class="store-search-input degoog-search-bar degoog-search-bar--square-advanced" autocomplete="off" />`;
  statusEl.textContent = "";
  saveEl.textContent = tr("clear-confirm");
  saveEl.disabled = false;
  saveEl.hidden = false;
  overlay.style.display = "";

  const close = (): void => {
    overlay.style.display = "none";
    statusEl.textContent = "";
    bodyEl.innerHTML = "";
  };
  closeBtn?.addEventListener("click", close, { once: true });

  saveEl.addEventListener("click", async () => {
    const input = bodyEl.querySelector<HTMLInputElement>("#indexer-clear-confirm");
    if (input?.value.trim() !== "CLEAR") {
      statusEl.textContent = tr("clear-modal-desc");
      return;
    }
    saveEl.disabled = true;
    try {
      const res = await fetch(`${getBase()}/api/indexer/clear`, {
        method: "POST",
        headers: jsonHeaders(getStoredToken),
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) {
        statusEl.textContent = "Failed";
        saveEl.disabled = false;
        return;
      }
      close();
      onCleared();
    } catch {
      statusEl.textContent = "Failed";
      saveEl.disabled = false;
    }
  });
};
