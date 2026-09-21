import { renderHtml } from "../../../shared/ui/core/html";
import { getBase } from "../../utils/base-url";
import { authHeaders, jsonHeaders } from "../../utils/request";

const t = window.scopedT("core");

const _formatSource = (source: string): string => `${source.trim()}\n`;

const _bindEditorKeys = (textarea: HTMLTextAreaElement): void => {
  textarea.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const blockStart = value.lastIndexOf("\n", start - 1) + 1;
    const blockEnd = end > start && value[end - 1] === "\n" ? end - 1 : end;
    const selection = value.slice(blockStart, blockEnd);

    if (e.shiftKey) {
      const outdented = selection.replace(/^(?: {1,2}|\t)/gm, "");
      const removed = selection.length - outdented.length;
      if (removed > 0) {
        textarea.value =
          value.slice(0, blockStart) + outdented + value.slice(blockEnd);
        textarea.selectionStart = Math.max(blockStart, start - 2);
        textarea.selectionEnd = Math.max(textarea.selectionStart, end - removed);
      }
      return;
    }

    if (start !== end && selection.includes("\n")) {
      const indented = selection.replace(/^/gm, "  ");
      const added = indented.length - selection.length;
      textarea.value =
        value.slice(0, blockStart) + indented + value.slice(blockEnd);
      textarea.selectionStart = start + 2;
      textarea.selectionEnd = end + added;
    } else {
      textarea.value = `${value.slice(0, start)}  ${value.slice(end)}`;
      textarea.selectionStart = start + 2;
      textarea.selectionEnd = start + 2;
    }
  });
};

export const ShortcutEditorFields = ({ scaffold }: { scaffold: string }): JSX.Element => (
  <>
    <label class="ext-field">
      <span class="ext-field-label">{t("settings-page.shortcuts.file-name")}</span>
      <input
        class="ext-field-input degoog-input"
        id="shortcut-file-name"
        value="my shortcut"
        autocomplete="off"
      />
    </label>
    <label class="ext-field">
      <span class="ext-field-label">{t("settings-page.shortcuts.source")}</span>
      <textarea
        class="ext-field-input ext-field-textarea degoog-input shortcut-code-input"
        id="shortcut-source"
        rows={24}
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
      >
        {scaffold}
      </textarea>
    </label>
  </>
);

export const openAddShortcutModal = async (
  getToken: () => string | null,
  onSaved: () => Promise<void>,
): Promise<void> => {
  const overlay = document.getElementById("ext-modal-overlay");
  const modal = document.getElementById("ext-modal");
  const titleEl = document.getElementById("ext-modal-title");
  const bodyEl = document.getElementById("ext-modal-body");
  const statusEl = document.getElementById("ext-modal-status");
  const saveEl = document.getElementById("ext-modal-save") as HTMLButtonElement | null;
  const closeEl = document.getElementById("ext-modal-close");
  if (!overlay || !bodyEl || !saveEl) return;
  modal?.classList.add("ext-modal--wide", "shortcut-editor-modal");
  const scaffoldRes = await fetch(`${getBase()}/api/settings/shortcuts/scaffold`, {
    headers: authHeaders(getToken),
  });
  const scaffold = scaffoldRes.ok
    ? ((await scaffoldRes.json()) as { source?: string }).source ?? ""
    : "";
  if (titleEl) titleEl.textContent = t("settings-page.shortcuts.add");
  if (statusEl) statusEl.textContent = "";
  saveEl.style.display = "";
  saveEl.textContent = t("settings-page.modal.save");
  bodyEl.innerHTML = renderHtml(<ShortcutEditorFields scaffold={scaffold} />);
  overlay.style.display = "flex";
  const sourceEl = document.getElementById("shortcut-source") as HTMLTextAreaElement | null;
  const nameEl = document.getElementById("shortcut-file-name") as HTMLInputElement | null;
  if (sourceEl) _bindEditorKeys(sourceEl);
  sourceEl?.focus();
  const cleanup = (): void => {
    modal?.classList.remove("ext-modal--wide", "shortcut-editor-modal");
    saveEl.removeEventListener("click", save);
    closeEl?.removeEventListener("click", cleanup);
    overlay.removeEventListener("click", onOverlayClick);
    document.removeEventListener("keydown", onEscape);
  };
  const onOverlayClick = (e: MouseEvent): void => {
    if (e.target === overlay) cleanup();
  };
  const onEscape = (e: KeyboardEvent): void => {
    if (e.key === "Escape") cleanup();
  };
  const save = async (): Promise<void> => {
    if (!sourceEl || !nameEl) return;
    saveEl.disabled = true;
    if (statusEl) statusEl.textContent = t("settings-page.modal.saving");
    try {
      const res = await fetch(`${getBase()}/api/settings/shortcuts/source`, {
        method: "POST",
        headers: jsonHeaders(getToken),
        body: JSON.stringify({
          name: nameEl.value,
          source: _formatSource(sourceEl.value),
        }),
      });
      if (!res.ok) throw new Error("save failed");
      if (statusEl) statusEl.textContent = t("settings-page.modal.saved");
      overlay.style.display = "none";
      cleanup();
      await onSaved();
    } catch {
      if (statusEl) statusEl.textContent = t("settings-page.modal.save-failed");
    } finally {
      saveEl.disabled = false;
    }
  };
  closeEl?.addEventListener("click", cleanup);
  overlay.addEventListener("click", onOverlayClick);
  document.addEventListener("keydown", onEscape);
  saveEl.addEventListener("click", save);
};
