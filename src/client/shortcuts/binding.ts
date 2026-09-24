import type { ShortcutBinding, ShortcutKind } from "../../shared/shortcuts";
import { eventKey, type Shortcut } from "./keyboard-shortcuts";

const PURE_MODIFIERS = new Set(["Control", "Alt", "Shift", "Meta"]);

const KEY_LABELS: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  " ": "Space",
  Escape: "Esc",
  Enter: "Enter",
};

export const isModifierOnly = (e: KeyboardEvent): boolean =>
  PURE_MODIFIERS.has(e.key);

export const eventToBinding = (e: KeyboardEvent): ShortcutBinding => ({
  key: eventKey(e),
  ctrl: e.ctrlKey,
  meta: e.metaKey,
  alt: e.altKey,
  shift: e.shiftKey,
});

export const eventToModifiers = (e: KeyboardEvent): ShortcutBinding => ({
  ctrl: e.ctrlKey,
  meta: e.metaKey,
  alt: e.altKey,
  shift: e.shiftKey,
});

const _platform = (): string =>
  (typeof navigator !== "undefined" &&
    (navigator.platform || navigator.userAgent)) ||
  "";

const _onApple = (): boolean => /mac|iphone|ipad|ipod/i.test(_platform());
const _onWindows = (): boolean => /win/i.test(_platform());

const MAC_MODIFIERS = { ctrl: "⌃", alt: "⌥", shift: "⇧", meta: "⌘" } as const;
const WIN_MODIFIERS = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: "Win" } as const;
const LINUX_MODIFIERS = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: "Super" } as const;

const _modifiers = (): { ctrl: string; alt: string; shift: string; meta: string } => {
  if (_onApple()) return MAC_MODIFIERS;
  if (_onWindows()) return WIN_MODIFIERS;
  return LINUX_MODIFIERS;
};

const _keyLabel = (key: string): string => {
  if (KEY_LABELS[key]) return KEY_LABELS[key];
  return key.length === 1 ? key.toUpperCase() : key;
};

export const bindingParts = (
  binding: ShortcutBinding,
  kind: ShortcutKind = "single",
): string[] => {
  const mods = _modifiers();
  const parts: string[] = [];
  if (binding.ctrl) parts.push(mods.ctrl);
  if (binding.alt) parts.push(mods.alt);
  if (binding.shift) parts.push(mods.shift);
  if (binding.meta) parts.push(mods.meta);
  if (kind === "numeric") {
    parts.push("1-9");
  } else if (binding.key) {
    parts.push(_keyLabel(binding.key));
  }
  return parts;
};

export const formatBinding = (
  binding: ShortcutBinding,
  kind: ShortcutKind = "single",
): string => bindingParts(binding, kind).join(" + ");

export const hasBinding = (binding: ShortcutBinding, kind: ShortcutKind): boolean => {
  if (kind === "numeric") {
    return Boolean(binding.ctrl || binding.alt || binding.shift || binding.meta);
  }
  return Boolean(binding.key);
};

export const toShortcut = (
  binding: ShortcutBinding,
  rest: Omit<Shortcut, "key" | "ctrl" | "meta" | "alt" | "shift">,
): Shortcut => ({
  key: binding.key ?? "",
  ctrl: binding.ctrl,
  meta: binding.meta,
  alt: binding.alt,
  shift: binding.shift,
  ...rest,
});
