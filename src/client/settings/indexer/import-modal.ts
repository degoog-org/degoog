import { getBase } from "../../utils/base-url";
import { authHeaders } from "../../utils/request";
import { getStoredToken } from "../../utils/settings-token";
import { fetchEngineTypes, IMPORT_CUSTOM_TYPE } from "./api";
import { mountProgress, type ProgressUi } from "./progress";
import { tr } from "./i18n";

const CHUNK_BYTES = 8 * 1024 * 1024;

interface StartResponse {
  sessionId?: string;
  error?: string;
}

interface CompleteResponse {
  ok?: boolean;
  urls?: number;
  hits?: number;
  error?: string;
}

const uploadChunks = async (
  file: File,
  sessionId: string,
  bar: ProgressUi,
): Promise<boolean> => {
  const base = getBase();
  for (let pos = 0; pos < file.size; pos += CHUNK_BYTES) {
    const slice = file.slice(pos, Math.min(file.size, pos + CHUNK_BYTES));
    const res = await fetch(`${base}/api/indexer/import/chunk`, {
      method: "POST",
      headers: {
        ...authHeaders(getStoredToken),
        "Content-Type": "application/octet-stream",
        "x-import-session": sessionId,
      },
      body: await slice.arrayBuffer(),
    });
    if (!res.ok) return false;
    const sent = Math.min(file.size, pos + CHUNK_BYTES);
    bar.set(sent, file.size);
    bar.label(`${Math.round((sent / Math.max(file.size, 1)) * 100)}%`);
  }
  return true;
};

const runImport = async (
  type: string,
  file: File,
  bodyEl: HTMLElement,
  statusEl: HTMLElement,
): Promise<CompleteResponse | null> => {
  const base = getBase();
  const bar = mountProgress(bodyEl);
  bar.label(tr("import-progress"));

  const startRes = await fetch(`${base}/api/indexer/import/start`, {
    method: "POST",
    headers: { ...authHeaders(getStoredToken), "Content-Type": "application/json" },
    body: JSON.stringify({ type }),
  });
  const start = (await startRes.json().catch(() => ({}))) as StartResponse;
  if (!startRes.ok || !start.sessionId) {
    statusEl.textContent = start.error ?? `Import failed (${startRes.status})`;
    bar.finish(true);
    return null;
  }

  const uploaded = await uploadChunks(file, start.sessionId, bar);
  if (!uploaded) {
    statusEl.textContent = tr("import-progress");
    bar.finish(true);
    return null;
  }

  bar.label(tr("import-processing"));
  const doneRes = await fetch(`${base}/api/indexer/import/complete`, {
    method: "POST",
    headers: { ...authHeaders(getStoredToken), "Content-Type": "application/json" },
    body: JSON.stringify({ session: start.sessionId }),
  });
  const data = (await doneRes.json().catch(() => ({}))) as CompleteResponse;
  if (!doneRes.ok || !data.ok) {
    statusEl.textContent = data.error ?? `Import failed (${doneRes.status})`;
    bar.finish(true);
    return null;
  }

  bar.finish();
  return data;
};

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
    <input type="file" id="indexer-import-file" accept=".db,.sql" class="degoog-input" style="margin-top:8px" />`;
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

  saveEl.addEventListener(
    "click",
    async () => {
      const sel = bodyEl.querySelector<HTMLSelectElement>("#indexer-import-type");
      const customEl = bodyEl.querySelector<HTMLInputElement>("#indexer-import-custom-type");
      const fileEl = bodyEl.querySelector<HTMLInputElement>("#indexer-import-file");
      const type = sel?.value === IMPORT_CUSTOM_TYPE ? customEl?.value.trim() : sel?.value.trim();
      const file = fileEl?.files?.[0];
      if (!type || !file) {
        statusEl.textContent = tr("import-missing");
        return;
      }
      saveEl.disabled = true;
      saveEl.hidden = true;

      try {
        const data = await runImport(type, file, bodyEl, statusEl);
        if (!data) {
          saveEl.disabled = false;
          saveEl.hidden = false;
          return;
        }
        statusEl.textContent = tr("import-done", {
          type,
          urls: String(data.urls ?? 0),
          hits: String(data.hits ?? 0),
        });
        onDone();
        saveEl.textContent = tr("import-close");
        saveEl.disabled = false;
        saveEl.hidden = false;
        saveEl.addEventListener("click", close, { once: true });
      } catch {
        statusEl.textContent = "Import failed";
        saveEl.disabled = false;
        saveEl.hidden = false;
      }
    },
  );
};
