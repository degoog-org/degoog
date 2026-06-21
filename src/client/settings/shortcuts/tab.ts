import { getBase } from "../../utils/base-url";
import { authHeaders, jsonHeaders } from "../../utils/request";
import { escapeHtml } from "../../utils/dom";
import { saveShortcuts } from "../../utils/settings-api";
import { flashError, flashSuccess } from "../shared/flash-msg";
import {
  SHORTCUT_ACTIONS,
  type ShortcutActionMeta,
  type ShortcutBinding,
} from "../../../shared/shortcuts";
import {
  eventToBinding,
  eventToModifiers,
  formatBinding,
  hasBinding,
  isModifierOnly,
} from "../../shortcuts/binding";

const t = window.scopedT("core");

let _overrides: Record<string, ShortcutBinding> = {};
let _customActions: ShortcutActionMeta[] = [];
let _getToken: () => string | null = () => null;
let _stopRecording: (() => void) | null = null;

const _actions = (): ShortcutActionMeta[] => [...SHORTCUT_ACTIONS, ..._customActions];

const _action = (id: string): ShortcutActionMeta | undefined =>
  _actions().find((a) => a.id === id);

const _effective = (action: ShortcutActionMeta): ShortcutBinding =>
  _overrides[action.id] ?? action.defaultBinding;

const _sameBinding = (a: ShortcutBinding, b: ShortcutBinding): boolean =>
  (a.key ?? "") === (b.key ?? "") &&
  !!a.ctrl === !!b.ctrl &&
  !!a.meta === !!b.meta &&
  !!a.alt === !!b.alt &&
  !!a.shift === !!b.shift;

const _label = (action: ShortcutActionMeta): string =>
  formatBinding(_effective(action), action.kind);

const _canDisable = (action: ShortcutActionMeta): boolean =>
  action.source !== undefined;

const _toggle = (action: ShortcutActionMeta): string =>
  _canDisable(action)
    ? `<label class="engine-toggle degoog-toggle-wrap degoog-toggle-wrap--transparent">
        <input type="checkbox" class="shortcut-toggle-input" data-action="${escapeHtml(action.id)}"${action.disabled ? "" : " checked"} aria-label="${escapeHtml(t("settings-page.shortcuts.enable-aria"))}">
        <span class="toggle-slider degoog-toggle"></span>
      </label>`
    : "";

const _card = (action: ShortcutActionMeta): string => `
  <div class="ext-card degoog-panel degoog-panel--ext-card" data-action="${escapeHtml(action.id)}">
    <div class="ext-card-main">
      <div class="ext-card-info">
        <span class="ext-card-name">${escapeHtml(action.displayName || t(`settings-page.shortcuts.actions.${action.id}.label`))}</span>
        <span class="ext-card-desc">${escapeHtml(action.description || t(`settings-page.shortcuts.actions.${action.id}.desc`))}</span>
      </div>
      <div class="ext-card-actions">
        <button type="button" class="btn btn--secondary degoog-btn degoog-btn--secondary shortcut-recorder" data-action="${escapeHtml(action.id)}">${escapeHtml(_label(action))}</button>
        <button type="button" class="degoog-icon-btn shortcut-reset" data-action="${escapeHtml(action.id)}" aria-label="${escapeHtml(t("settings-page.shortcuts.reset"))}">
          <i class="fa-solid fa-rotate-left"></i>
        </button>
        ${action.editable ? `<button type="button" class="degoog-icon-btn shortcut-delete" data-action="${escapeHtml(action.id)}" aria-label="${escapeHtml(t("settings-page.shortcuts.delete"))}"><i class="fa-solid fa-trash"></i></button>` : ""}
        ${_toggle(action)}
      </div>
    </div>
  </div>`;

const _header = (): string => `
  <section class="settings-section ext-card degoog-panel degoog-panel--ext-card">
    <div class="setting-section-heading-wrapper">
      <h2 class="settings-section-heading">${escapeHtml(t("settings-page.shortcuts.heading"))}</h2>
      <div class="floating-section-icon"><i class="fa-solid fa-keyboard"></i></div>
    </div>
    <p class="settings-desc">${escapeHtml(t("settings-page.shortcuts.desc"))}</p>
    <div class="settings-page-actions">
      <button class="btn btn--primary degoog-btn degoog-btn--primary" id="shortcuts-add" type="button">${escapeHtml(t("settings-page.shortcuts.add"))}</button>
      <button class="btn btn--secondary degoog-btn degoog-btn--secondary" id="shortcuts-reset-all" type="button">${escapeHtml(t("settings-page.shortcuts.reset-all"))}</button>
    </div>
  </section>`;

const _refreshLabel = (id: string): void => {
  const action = _action(id);
  if (!action) return;
  const btn = document.querySelector<HTMLButtonElement>(
    `.shortcut-recorder[data-action="${id}"]`,
  );
  if (btn) btn.textContent = _label(action);
};

const _save = async (): Promise<void> => {
  const ok = await saveShortcuts(_overrides, _getToken);
  if (ok) {
    flashSuccess(t("settings-page.server.saved"));
  } else {
    flashError(t("settings-page.server.save-failed-network"));
  }
};

const _setBinding = (
  action: ShortcutActionMeta,
  binding: ShortcutBinding,
): void => {
  if (_sameBinding(binding, action.defaultBinding)) {
    delete _overrides[action.id];
  } else {
    _overrides[action.id] = binding;
  }
  _refreshLabel(action.id);
  void _save();
};

const _record = (action: ShortcutActionMeta, btn: HTMLButtonElement): void => {
  _stopRecording?.();
  btn.classList.add("shortcut-recorder--recording");
  btn.textContent = t(
    action.kind === "numeric"
      ? "settings-page.shortcuts.recording-numeric"
      : "settings-page.shortcuts.recording",
  );

  const stop = (): void => {
    document.removeEventListener("keydown", onKey, true);
    btn.classList.remove("shortcut-recorder--recording");
    _refreshLabel(action.id);
    _stopRecording = null;
  };

  const onKey = (e: KeyboardEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") return stop();
    if (isModifierOnly(e)) return;
    const binding =
      action.kind === "numeric" ? eventToModifiers(e) : eventToBinding(e);
    if (!hasBinding(binding, action.kind)) return;
    _setBinding(action, binding);
    stop();
  };

  _stopRecording = stop;
  document.addEventListener("keydown", onKey, true);
};

const _bind = (container: HTMLElement): void => {
  container.querySelectorAll<HTMLButtonElement>(".shortcut-recorder").forEach(
    (btn) => {
      btn.addEventListener("click", () => {
        const action = _action(btn.dataset.action ?? "");
        if (action) _record(action, btn);
      });
    },
  );
  container.querySelectorAll<HTMLButtonElement>(".shortcut-reset").forEach(
    (btn) => {
      btn.addEventListener("click", () => {
        const action = _action(btn.dataset.action ?? "");
        if (action) _setBinding(action, action.defaultBinding);
      });
    },
  );
  container.querySelectorAll<HTMLInputElement>(".shortcut-toggle-input").forEach(
    (input) => {
      let reqToken = 0;
      let confirmed = input.checked;
      input.addEventListener("change", async () => {
        const id = input.dataset.action;
        if (!id) return;
        const intended = input.checked;
        const disabled = !intended;
        const token = ++reqToken;
        try {
          const res = await fetch(
            `${getBase()}/api/extensions/${encodeURIComponent(id)}/settings`,
            {
              method: "POST",
              headers: jsonHeaders(_getToken),
              body: JSON.stringify({ disabled: String(disabled) }),
            },
          );
          if (!res.ok) throw new Error("save failed");
          if (token !== reqToken) return;
          confirmed = intended;
          const action = _customActions.find((a) => a.id === id);
          if (action) action.disabled = disabled;
          flashSuccess(t("settings-page.server.saved"));
        } catch (err) {
          console.warn("[settings] shortcut toggle failed", err);
          if (token !== reqToken) return;
          input.checked = confirmed;
          flashError(t("settings-page.server.save-failed-network"));
        }
      });
    },
  );
  container.querySelectorAll<HTMLButtonElement>(".shortcut-delete").forEach(
    (btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.action;
        if (!id) return;
        const res = await fetch(
          `${getBase()}/api/settings/shortcuts/source/${encodeURIComponent(id)}`,
          { method: "DELETE", headers: authHeaders(_getToken) },
        );
        if (!res.ok) {
          flashError(t("settings-page.server.save-failed-network"));
          return;
        }
        delete _overrides[id];
        await initShortcutsTab(_getToken);
        flashSuccess(t("settings-page.server.saved"));
      });
    },
  );
  document
    .getElementById("shortcuts-reset-all")
    ?.addEventListener("click", () => {
      _overrides = {};
      for (const action of _actions()) _refreshLabel(action.id);
      void _save();
    });
  document
    .getElementById("shortcuts-add")
    ?.addEventListener("click", () => void _openAddShortcutModal());
};

const _load = async (): Promise<void> => {
  try {
    const res = await fetch(`${getBase()}/api/settings/shortcuts`, {
      headers: authHeaders(_getToken),
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      shortcuts?: Record<string, ShortcutBinding>;
      custom?: ShortcutActionMeta[];
    };
    _overrides = data.shortcuts ?? {};
    _customActions = data.custom ?? [];
  } catch (err) {
    console.warn("[settings] shortcuts load failed", err);
  }
};

const _formatSource = (source: string): string => `${source.trim()}\n`;

const _bindEditorKeys = (textarea: HTMLTextAreaElement): void => {
  textarea.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const blockStart = value.lastIndexOf("\n", start - 1) + 1;
    const blockEnd =
      end > start && value[end - 1] === "\n" ? end - 1 : end;
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

const _openAddShortcutModal = async (): Promise<void> => {
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
    headers: authHeaders(_getToken),
  });
  const scaffold = scaffoldRes.ok
    ? ((await scaffoldRes.json()) as { source?: string }).source ?? ""
    : "";
  if (titleEl) titleEl.textContent = t("settings-page.shortcuts.add");
  if (statusEl) statusEl.textContent = "";
  saveEl.style.display = "";
  saveEl.textContent = t("settings-page.modal.save");
  bodyEl.innerHTML = `
    <label class="ext-field">
      <span class="ext-field-label">${escapeHtml(t("settings-page.shortcuts.file-name"))}</span>
      <input class="ext-field-input degoog-input" id="shortcut-file-name" value="my shortcut" autocomplete="off">
    </label>
    <label class="ext-field">
      <span class="ext-field-label">${escapeHtml(t("settings-page.shortcuts.source"))}</span>
      <textarea class="ext-field-input ext-field-textarea degoog-input shortcut-code-input" id="shortcut-source" rows="24" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off">${escapeHtml(scaffold)}</textarea>
    </label>`;
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
        headers: jsonHeaders(_getToken),
        body: JSON.stringify({
          name: nameEl.value,
          source: _formatSource(sourceEl.value),
        }),
      });
      if (!res.ok) throw new Error("save failed");
      if (statusEl) statusEl.textContent = t("settings-page.modal.saved");
      overlay.style.display = "none";
      cleanup();
      await initShortcutsTab(_getToken);
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

export const initShortcutsTab = async (
  getToken: () => string | null,
): Promise<void> => {
  const container = document.getElementById("shortcuts-content");
  if (!container) return;
  _getToken = getToken;
  await _load();
  container.innerHTML =
    _header() +
    `<div class="ext-cards">${_actions().map(_card).join("")}</div>`;
  _bind(container);
};
