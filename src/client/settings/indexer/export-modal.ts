import { authHeaders } from "../../utils/request";
import { getStoredToken } from "../../utils/settings-token";
import type { IndexerStats } from "../../types/indexer";
import { downloadIndexerExport } from "./download";
import { orderTypes } from "./api";
import { mountProgress } from "./progress";
import { tr } from "./i18n";

interface ExportEls {
  overlay: HTMLElement;
  titleEl: HTMLElement;
  bodyEl: HTMLElement;
  statusEl: HTMLElement;
  saveEl: HTMLButtonElement;
  closeBtn: HTMLElement | null;
}

const getEls = (): ExportEls | null => {
  const overlay = document.getElementById("ext-modal-overlay");
  const titleEl = document.getElementById("ext-modal-title");
  const bodyEl = document.getElementById("ext-modal-body");
  const statusEl = document.getElementById("ext-modal-status");
  const saveEl = document.getElementById("ext-modal-save") as HTMLButtonElement | null;
  const closeBtn = document.getElementById("ext-modal-close");
  if (!overlay || !titleEl || !bodyEl || !statusEl || !saveEl) return null;
  return { overlay, titleEl, bodyEl, statusEl, saveEl, closeBtn };
};

const runExport = async (type: string, els: ExportEls): Promise<void> => {
  els.saveEl.hidden = true;
  els.bodyEl.innerHTML = "";
  const bar = mountProgress(els.bodyEl);
  bar.label(tr("export-btn"));

  await downloadIndexerExport(type, {
    headers: authHeaders(getStoredToken),
    onStatus: (text) => {
      if (text) {
        els.statusEl.textContent = text;
        bar.finish(true);
      }
    },
    onProgress: (done, total) => {
      bar.set(done, total);
      bar.label(`${Math.round((done / Math.max(total, 1)) * 100)}%`);
    },
  });

  if (!els.statusEl.textContent) {
    bar.finish();
    bar.label(tr("export-done"));
  }
};

export const openExportModal = (stats: IndexerStats | null): void => {
  const types = orderTypes(Object.keys(stats?.byType ?? {}));
  if (types.length === 0) return;

  const els = getEls();
  if (!els) return;

  els.titleEl.textContent = tr("export-modal-title");
  els.statusEl.textContent = "";
  els.overlay.style.display = "";

  const close = (): void => {
    els.overlay.style.display = "none";
    els.statusEl.textContent = "";
    els.bodyEl.innerHTML = "";
  };
  els.closeBtn?.addEventListener("click", close, { once: true });

  if (types.length === 1) {
    void runExport(types[0], els);
    return;
  }

  els.bodyEl.replaceChildren();
  const desc = document.createElement("p");
  desc.textContent = tr("export-modal-desc");
  const wrap = document.createElement("div");
  wrap.className = "degoog-select-wrap";
  const select = document.createElement("select");
  select.id = "indexer-export-type";
  select.className = "degoog-input";
  for (const type of types) {
    const opt = document.createElement("option");
    opt.value = type;
    opt.textContent = type;
    select.append(opt);
  }
  wrap.append(select);
  els.bodyEl.append(desc, wrap);
  els.saveEl.textContent = tr("export-btn");
  els.saveEl.disabled = false;
  els.saveEl.hidden = false;

  els.saveEl.addEventListener(
    "click",
    () => {
      const sel = els.bodyEl.querySelector<HTMLSelectElement>("#indexer-export-type");
      const type = sel?.value;
      if (!type) return;
      void runExport(type, els);
    },
    { once: true },
  );
};
