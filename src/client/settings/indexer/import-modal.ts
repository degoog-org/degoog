import { getBase } from "../../utils/base-url";
import { authHeaders } from "../../utils/request";
import { getStoredToken } from "../../utils/settings-token";
import { fetchEngineTypes, IMPORT_CUSTOM_TYPE } from "./api";
import { tr } from "./i18n";

export const openImportModal = async (onDone: () => void): Promise<void> => {
  const overlay = document.getElementById("ext-modal-overlay");
  const titleEl = document.getElementById("ext-modal-title");
  const bodyEl = document.getElementById("ext-modal-body");
  const statusEl = document.getElementById("ext-modal-status");
  const saveEl = document.getElementById("ext-modal-save") as HTMLButtonElement | null;
  const closeBtn = document.getElementById("ext-modal-close");
  if (!overlay || !titleEl || !bodyEl || !statusEl || !saveEl) return;

  const engineTypes = await fetchEngineTypes();
  const typeOptions = [
    ...engineTypes.map((et) => `<option value="${et}">${et}</option>`),
    `<option value="${IMPORT_CUSTOM_TYPE}">${tr("import-type-custom")}</option>`,
  ].join("");

  titleEl.textContent = tr("import-modal-title");
  bodyEl.innerHTML = `
    <p>${tr("import-modal-desc")}</p>
    <div class="degoog-select-wrap">
      <select id="indexer-import-type" class="degoog-input">
        ${typeOptions}
      </select>
    </div>
    <input
      type="text"
      id="indexer-import-custom-type"
      class="degoog-input"
      style="margin-top:8px"
      hidden
    />
    <input type="file" id="indexer-import-file" accept=".db" class="degoog-input" style="margin-top:8px" />`;
  statusEl.textContent = "";
  saveEl.textContent = tr("import-btn");
  saveEl.disabled = false;
  saveEl.hidden = false;
  overlay.style.display = "";

  const typeEl = bodyEl.querySelector<HTMLSelectElement>("#indexer-import-type");
  const customTypeEl = bodyEl.querySelector<HTMLInputElement>("#indexer-import-custom-type");

  typeEl?.addEventListener("change", () => {
    if (!customTypeEl) return;
    customTypeEl.hidden = typeEl.value !== IMPORT_CUSTOM_TYPE;
    if (!customTypeEl.hidden) customTypeEl.focus();
  });

  const close = (): void => {
    overlay.style.display = "none";
    statusEl.textContent = "";
    bodyEl.innerHTML = "";
  };
  closeBtn?.addEventListener("click", close, { once: true });

  saveEl.addEventListener("click", async () => {
    const sel = bodyEl.querySelector<HTMLSelectElement>("#indexer-import-type");
    const customEl = bodyEl.querySelector<HTMLInputElement>("#indexer-import-custom-type");
    const fileEl = bodyEl.querySelector<HTMLInputElement>("#indexer-import-file");
    const type = sel?.value === IMPORT_CUSTOM_TYPE
      ? customEl?.value.trim()
      : sel?.value.trim();
    const file = fileEl?.files?.[0];
    if (!type || !file) {
      statusEl.textContent = tr("import-missing");
      return;
    }
    saveEl.disabled = true;
    statusEl.textContent = tr("import-progress");
    try {
      const form = new FormData();
      form.append("type", type);
      form.append("file", file);
      const res = await fetch(`${getBase()}/api/indexer/import`, {
        method: "POST",
        headers: authHeaders(getStoredToken),
        body: form,
      });
      const data = (await res.json()) as { ok?: boolean; urls?: number; hits?: number; error?: string };
      if (!res.ok || !data.ok) {
        statusEl.textContent = data.error ?? `Import failed (${res.status})`;
        saveEl.disabled = false;
        return;
      }
      statusEl.textContent = tr("import-done", {
        type,
        urls: String(data.urls ?? 0),
        hits: String(data.hits ?? 0),
      });
      saveEl.hidden = true;
      onDone();
    } catch {
      statusEl.textContent = "Import failed";
      saveEl.disabled = false;
    }
  }, { once: true });
};
