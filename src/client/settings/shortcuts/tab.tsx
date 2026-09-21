import { render } from "../../../shared/ui/core/dom";
import { Button } from "../../../shared/ui/components/primitives/button";
import { Icon } from "../../../shared/ui/components/primitives/icon";
import { Section } from "../../../shared/ui/components/layout/section";
import { getBase } from "../../utils/base-url";
import { authHeaders, jsonHeaders } from "../../utils/request";
import { saveShortcuts } from "../../utils/settings-api";
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

const _toggleHandler = (action: ShortcutActionMeta): ((event: Event) => void) => {
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

const ShortcutToggle = ({ action }: { action: ShortcutActionMeta }): JSX.Element => (
  <label class="engine-toggle degoog-toggle-wrap degoog-toggle-wrap--transparent">
    <input
      type="checkbox"
      class="shortcut-toggle-input"
      data-action={action.id}
      checked={!action.disabled}
      aria-label={t("settings-page.shortcuts.enable-aria")}
      onChange={_toggleHandler(action)}
    />
    <span class="toggle-slider degoog-toggle"></span>
  </label>
);

const ShortcutCard = ({ action }: { action: ShortcutActionMeta }): JSX.Element => (
  <div class="ext-card degoog-panel degoog-panel--ext-card" data-action={action.id}>
    <div class="ext-card-main">
      <div class="ext-card-info">
        <span class="ext-card-name">
          {action.displayName || t(`settings-page.shortcuts.actions.${action.id}.label`)}
        </span>
        <span class="ext-card-desc">
          {action.description || t(`settings-page.shortcuts.actions.${action.id}.desc`)}
        </span>
      </div>
      <div class="ext-card-actions">
        <Button
          variant="secondary"
          class="shortcut-recorder"
          data-action={action.id}
          onClick={(event) => _record(action, event.currentTarget as HTMLButtonElement)}
        >
          {_label(action)}
        </Button>
        <button
          type="button"
          class="degoog-icon-btn shortcut-reset"
          data-action={action.id}
          aria-label={t("settings-page.shortcuts.reset")}
          onClick={() => _setBinding(action, action.defaultBinding)}
        >
          <Icon name="fa-solid fa-rotate-left" />
        </button>
        {action.editable ? (
          <button
            type="button"
            class="degoog-icon-btn shortcut-delete"
            data-action={action.id}
            aria-label={t("settings-page.shortcuts.delete")}
            onClick={() => void _deleteShortcut(action.id)}
          >
            <Icon name="fa-solid fa-trash" />
          </button>
        ) : null}
        {_canDisable(action) ? <ShortcutToggle action={action} /> : null}
      </div>
    </div>
  </div>
);

const ShortcutsHeader = (): JSX.Element => (
  <Section
    icon="fa-solid fa-keyboard"
    heading={t("settings-page.shortcuts.heading")}
    desc={t("settings-page.shortcuts.desc")}
  >
    <div class="settings-page-actions">
      <Button
        variant="primary"
        id="shortcuts-add"
        onClick={() =>
          void openAddShortcutModal(_getToken, () => initShortcutsTab(_getToken))
        }
      >
        {t("settings-page.shortcuts.add")}
      </Button>
      <Button
        variant="secondary"
        id="shortcuts-reset-all"
        onClick={() => {
          _overrides = {};
          for (const action of _actions()) _refreshLabel(action.id);
          void _save();
        }}
      >
        {t("settings-page.shortcuts.reset-all")}
      </Button>
    </div>
  </Section>
);

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
      <ShortcutsHeader />
      <div class="ext-cards">
        {_actions().map((action) => (
          <ShortcutCard key={action.id} action={action} />
        ))}
      </div>
    </>,
    container,
  );
};
