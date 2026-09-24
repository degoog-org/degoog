import { registerShortcut } from "./keyboard-shortcuts";
import type { ShortcutBinding } from "../../shared/shortcuts";
import { toShortcut } from "./binding";
import { focusSearch } from "./actions/focus";
import { cycleTab, hasTabs, selectTab } from "./actions/tabs";
import { goHome, goSettings } from "./actions/navigate";
import { hasFocusedResult, moveResult, openResult } from "./actions/results";

type ApplyFn = (binding: ShortcutBinding) => void;

const TAB_NUMBER_MAX = 9;

const _single =
  (handler: () => void, when?: () => boolean): ApplyFn =>
  (binding) =>
    registerShortcut(toShortcut(binding, { handler, when }));

const _numericTabs: ApplyFn = (binding) => {
  for (let n = 1; n <= TAB_NUMBER_MAX; n++) {
    registerShortcut(
      toShortcut(
        { ...binding, key: String(n) },
        { handler: () => selectTab(n - 1), when: hasTabs },
      ),
    );
  }
};

const APPLY: Record<string, ApplyFn> = {
  "focus-search": _single(focusSearch),
  "next-tab": _single(() => cycleTab(1), hasTabs),
  "prev-tab": _single(() => cycleTab(-1), hasTabs),
  "tab-by-number": _numericTabs,
  "go-home": _single(goHome),
  "go-settings": _single(goSettings),
  "result-down": _single(() => moveResult(1)),
  "result-up": _single(() => moveResult(-1)),
  "result-open": _single(openResult, hasFocusedResult),
};

export const applyShortcut = (id: string, binding: ShortcutBinding): void => {
  APPLY[id]?.(binding);
};
