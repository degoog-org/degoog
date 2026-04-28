type ShortcutHandler = (e: KeyboardEvent) => void;

export type Shortcut = {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  shift?: boolean;
  allowInEditable?: boolean;
  when?: () => boolean;
  handler: ShortcutHandler;
};

const shortcuts: Shortcut[] = [];
let initialized = false;

const _isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
};

const _modifiersMatch = (e: KeyboardEvent, s: Shortcut): boolean =>
  e.ctrlKey === !!s.ctrl &&
  e.metaKey === !!s.meta &&
  e.altKey === !!s.alt &&
  e.shiftKey === !!s.shift;

export function registerShortcut(shortcut: Shortcut): void {
  shortcuts.push(shortcut);
}

export function focusInput(element: HTMLInputElement | null): void {
  if (!element) return;
  registerShortcut({
    key: "/",
    when: () => document.body.contains(element),
    handler: () => {
      element.focus();
      element.select();
    },
  });
}

export function initKeyboardShortcuts(): void {
  if (initialized) return;
  initialized = true;

  document.addEventListener("keydown", (e) => {
    const editable = _isEditableTarget(e.target);
    for (const s of shortcuts) {
      if (s.key !== e.key) continue;
      if (!_modifiersMatch(e, s)) continue;
      if (editable && !s.allowInEditable) continue;
      if (s.when && !s.when()) continue;
      e.preventDefault();
      s.handler(e);
      return;
    }
  });
}
