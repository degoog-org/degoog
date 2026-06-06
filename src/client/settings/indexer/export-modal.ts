import { authHeaders } from "../../utils/request";
import { getStoredToken } from "../../utils/settings-token";
import type { IndexerStats } from "../../types/indexer";
import { downloadIndexerExport } from "./download";
import { tr } from "./i18n";
import { setActionStatus } from "./stats";

const downloadExportForType = async (type: string): Promise<void> => {
  await downloadIndexerExport(type, {
    headers: authHeaders(getStoredToken),
    onStatus: setActionStatus,
  });
};

export const openExportModal = (stats: IndexerStats | null): void => {
  const types = Object.keys(stats?.byType ?? {});
  if (types.length === 1) {
    void downloadExportForType(types[0]);
    return;
  }

  const overlay = document.getElementById("ext-modal-overlay");
  const titleEl = document.getElementById("ext-modal-title");
  const bodyEl = document.getElementById("ext-modal-body");
  const statusEl = document.getElementById("ext-modal-status");
  const saveEl = document.getElementById("ext-modal-save") as HTMLButtonElement | null;
  const closeBtn = document.getElementById("ext-modal-close");
  if (!overlay || !titleEl || !bodyEl || !statusEl || !saveEl) return;

  titleEl.textContent = tr("export-modal-title");
  bodyEl.innerHTML = `
    <p>${tr("export-modal-desc")}</p>
    <div class="degoog-select-wrap">
      <select id="indexer-export-type" class="degoog-input">
        ${types.map((type) => `<option value="${type}">${type}</option>`).join("")}
      </select>
    </div>`;
  statusEl.textContent = "";
  saveEl.textContent = tr("export-btn");
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
    const sel = bodyEl.querySelector<HTMLSelectElement>("#indexer-export-type");
    const type = sel?.value;
    if (!type) return;
    saveEl.disabled = true;
    close();
    await downloadExportForType(type);
  }, { once: true });
};
