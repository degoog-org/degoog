import { SHORTCUT_ACTIONS, type ClientShortcut, type ShortcutsConfig } from "../../shared/shortcuts";
import { hasBinding, toShortcut } from "./binding";
import { applyShortcut } from "./registry";
import { registerShortcut } from "../utils/keyboard-shortcuts";

declare global {
  interface Window {
    __DEGOOG_SHORTCUTS__?: ShortcutsConfig;
  }
}

const _runCustomShortcut = (shortcut: ClientShortcut, event: KeyboardEvent): void => {
  void import(/* @vite-ignore */ shortcut.moduleUrl)
    .then((mod: { default?: { run?: (ctx: object) => void }; run?: (ctx: object) => void }) => {
      const run = mod.default?.run ?? mod.run;
      if (typeof run !== "function") return;
      return Promise.resolve(
        run({
          document,
          window,
          event,
          location: window.location,
          navigator: window.navigator,
        }),
      );
    })
    .catch((err) => {
      console.warn("[shortcuts] custom shortcut failed", shortcut.id, err);
    });
};

export const initShortcuts = (): void => {
  const config = window.__DEGOOG_SHORTCUTS__;
  if (!config) return;
  for (const action of SHORTCUT_ACTIONS) {
    const binding = config.bindings[action.id] ?? action.defaultBinding;
    applyShortcut(action.id, binding);
  }
  for (const shortcut of config.custom ?? []) {
    const binding = config.bindings[shortcut.id] ?? shortcut.defaultBinding;
    const kind = shortcut.kind ?? "single";
    if (!hasBinding(binding, kind)) continue;
    if (kind === "numeric") {
      for (let n = 1; n <= 9; n++) {
        registerShortcut(
          toShortcut(
            { ...binding, key: String(n) },
            { handler: (e) => _runCustomShortcut(shortcut, e) },
          ),
        );
      }
    } else {
      registerShortcut(
        toShortcut(binding, { handler: (e) => _runCustomShortcut(shortcut, e) }),
      );
    }
  }
};
