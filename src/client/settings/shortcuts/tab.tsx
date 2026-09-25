import { render } from "../../../shared/ui/tribute/dom";
import { ShortcutCard } from "./shortcut-card";
import { ShortcutsHeader } from "./shortcuts-header";
import { getBase } from "../../utils/net/base-url";
import { authHeaders, jsonHeaders } from "../../utils/net/request";
import { saveShortcuts } from "../../utils/settings/settings-api";
import { flashError, flashSuccess } from "../shared/flash-msg";
import { openAddShortcutModal } from "./add-modal";
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

const _actions = (): ShortcutActionMeta[] => [
  ...SHORTCUT_ACTIONS,
  ..._customActions,
];

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

const _toggleHandler = (
  action: ShortcutActionMeta,
): ((event: Event) => void) => {
  let reqToken = 0;
  let confirmed = !action.disabled;
  return (event: Event): void => {
    const input = event.currentTarget as HTMLInputElement;
    const intended = input.checked;
    const disabled = !intended;
    const token = ++reqToken;
    void (async (): Promise<void> => {
      try {
        const res = await fetch(
          `${getBase()}/api/extensions/${encodeURIComponent(action.id)}/settings`,
          {
            method: "POST",
            headers: jsonHeaders(_getToken),
            body: JSON.stringify({ disabled: String(disabled) }),
          },
        );
        if (!res.ok) throw new Error("save failed");
        if (token !== reqToken) return;
        confirmed = intended;
        const target = _customActions.find((a) => a.id === action.id);
        if (target) target.disabled = disabled;
        flashSuccess(t("settings-page.server.saved"));
      } catch (err) {
        console.warn("[settings] shortcut toggle failed", err);
        if (token !== reqToken) return;
        input.checked = confirmed;
        flashError(t("settings-page.server.save-failed-network"));
      }
    })();
  };
};

const _deleteShortcut = async (id: string): Promise<void> => {
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

export const initShortcutsTab = async (
  getToken: () => string | null,
): Promise<void> => {
  const container = document.getElementById("shortcuts-content");
  if (!container) return;
  _getToken = getToken;
  await _load();
  render(
    <>
      <ShortcutsHeader
        onAdd={() =>
          void openAddShortcutModal(_getToken, () =>
            initShortcutsTab(_getToken),
          )
        }
        onResetAll={() => {
          _overrides = {};
          for (const action of _actions()) _refreshLabel(action.id);
          void _save();
        }}
      />
      <div class="ext-cards">
        {_actions().map((action) => (
          <ShortcutCard
            key={action.id}
            action={action}
            label={_label(action)}
            canDisable={_canDisable(action)}
            onRecord={(button) => _record(action, button)}
            onReset={() => _setBinding(action, action.defaultBinding)}
            onDelete={() => void _deleteShortcut(action.id)}
            onToggle={_toggleHandler(action)}
          />
        ))}
      </div>
    </>,
    container,
  );
};
