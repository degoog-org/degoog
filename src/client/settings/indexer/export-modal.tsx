import { clear, render } from "../../../shared/ui/tribute/dom";
import { ExportBody } from "./export-body";
import { authHeaders } from "../../utils/request";
import { getStoredToken } from "../../utils/settings-token";
import type { IndexerStats } from "../../../shared/indexer";
import { canSaveStream, downloadIndexerExport } from "./download";
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
  const saveEl = document.getElementById(
    "ext-modal-save",
  ) as HTMLButtonElement | null;
  const closeBtn = document.getElementById("ext-modal-close");
  if (!overlay || !titleEl || !bodyEl || !statusEl || !saveEl) return null;
  return { overlay, titleEl, bodyEl, statusEl, saveEl, closeBtn };
};

const _warnKey = (): string =>
  window.isSecureContext ? "export-memory-warning" : "export-insecure-warning";

const runExport = async (type: string, els: ExportEls): Promise<void> => {
  els.saveEl.hidden = true;
  clear(els.bodyEl);
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
    clear(els.bodyEl);
    els.saveEl.onclick = null;
  };
  els.closeBtn?.addEventListener("click", close, { once: true });

  const streams = canSaveStream();
  if (types.length === 1 && streams) {
    void runExport(types[0], els);
    return;
  }

  render(
    <ExportBody
      warningKey={streams ? undefined : _warnKey()}
      showPicker={types.length > 1}
    />,
    els.bodyEl,
  );

  if (types.length > 1) {
    const select = document.createElement("select");
    select.id = "indexer-export-type";
    select.className = "degoog-input";
    for (const type of types) {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type;
      select.append(option);
    }
    els.bodyEl.querySelector(".degoog-select-wrap")?.append(select);
  }

  els.saveEl.textContent = tr("export-btn");
  els.saveEl.disabled = false;
  els.saveEl.hidden = false;

  els.saveEl.onclick = () => {
    const sel = els.bodyEl.querySelector<HTMLSelectElement>(
      "#indexer-export-type",
    );
    const type = sel?.value ?? types[0];
    if (!type) return;
    els.saveEl.onclick = null;
    void runExport(type, els);
  };
};
